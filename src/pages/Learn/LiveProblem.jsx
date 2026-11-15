import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { consentGradingRecovery, getGradingRecovery, startProblemReteach, startProblems, submitAttempt, viewSolution } from '../../api/assessment';
import { newKey } from '../../api/client';
import { canRetrySame, isTerminal, messageFor } from '../../api/errors';
import { getSession } from '../../api/sessions';
import bubbleConfused from '../../assets/characters/bubble-confused.png';
import bubbleSad from '../../assets/characters/bubble-sad.png';
import emotionMint from '../../assets/characters/emotion-mint.png';
import arrowIcon from '../../assets/icons/arrow-right.svg';
import lockIcon from '../../assets/icons/lock.svg';
import retryIcon from '../../assets/icons/retry.svg';
import AiMessage from '../../components/AiMessage/AiMessage';
import AppBar from '../../components/AppBar/AppBar';
import AppShell from '../../components/AppShell/AppShell';
import BottomCTA from '../../components/BottomCTA/BottomCTA';
import Button from '../../components/Button/Button';
import Dialog from '../../components/Dialog/Dialog';
import InlineError from '../../components/InlineError/InlineError';
import StepBar from '../../components/StepBar/StepBar';
import Tag from '../../components/Tag/Tag';
import TextField from '../../components/TextField/TextField';
import { STAGE_ROUTES } from '../../learning/useLearningSession';
import { PROBLEM_GUIDE } from './problemSamples';
import styles from './ProblemPage.module.css';

const AI_ASK = '정답 보기 전에 저한테 한 번만 더 설명해 줄래요? 어디서 달라졌는지 궁금해요.';

export default function LiveProblem({ session, subject }) {
  const navigate = useNavigate();
  const resuming = Boolean(session.problemReturn);
  const [phase, setPhase] = useState(resuming ? 'loading' : 'intro');
  const [problems, setProblems] = useState([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [work, setWork] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [solution, setSolution] = useState(null);
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(Boolean(session.recovery));
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recovery, setRecovery] = useState(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const sendingRef = useRef(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const submitRef = useRef(null);
  const reteachKeyRef = useRef(null);

  const total = problems.length;
  const problem = problems[index];

  function fail(err, fallback) {
    setError(messageFor(err, fallback));
    setBlocked(isTerminal(err));
  }

  async function begin() {
    if (sendingRef.current || blocked || checkingRecovery || recovery?.savedSubmission) return;
    sendingRef.current = true;
    setError('');
    setBusy('문제를 만들고 있어요...');
    try {
      const set = await startProblems(session.sessionId);
      setProblems(set.problems);
      const returned = session.problemReturn?.problemId;
      const found = returned ? set.problems.findIndex((item) => item.problemId === returned) : 0;
      setIndex(Math.max(found, 0));
      setPhase('solve');
    } catch (err) {
      fail(err, '문제를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
      if (resuming) setPhase('intro');
    } finally {
      sendingRef.current = false;
      setBusy('');
    }
  }

  const restoreRecovery = useCallback((saved) => {
    if (resuming && saved?.state === 'completed') {
      setRecovery(null);
      setBlocked(false);
      return;
    }
    setRecovery(saved);
    if (!saved?.savedSubmission) {
      if (!session.recovery) { setBlocked(false); setError(''); }
      return;
    }
    setProblems(saved.problems);
    setIndex(Math.max(0, saved.problems.findIndex((item) => item.problemId === saved.problemId)));
    setAnswer(saved.savedSubmission.answer);
    setWork(saved.savedSubmission.work);
    submitRef.current = { key: saved.savedSubmission.idempotencyKey };
    setBlocked(true);
    setPhase('solve');
    setError('');
  }, [resuming, session.recovery]);

  async function checkRecovery() {
    if (sendingRef.current) return;
    setCheckingRecovery(true);
    try {
      restoreRecovery(await getGradingRecovery(session.sessionId));
    } catch (err) {
      fail(err, '저장 상태를 확인하지 못했어요. 상태 확인 후 진행해 주세요.');
      setBlocked(true);
    } finally { setCheckingRecovery(false); }
  }

  useEffect(() => {
    let active = true;
    getGradingRecovery(session.sessionId).then((saved) => {
      if (active) restoreRecovery(saved);
    }).catch((err) => {
      if (!active) return;
      setError(messageFor(err, '저장 상태를 확인하지 못했어요. 상태 확인 후 진행해 주세요.'));
      setBlocked(true);
    }).finally(() => { if (active) setCheckingRecovery(false); });
    return () => { active = false; };
  }, [session.sessionId, restoreRecovery]);

  const beginRef = useRef(begin);
  useEffect(() => {
    beginRef.current = begin;
  });

  useEffect(() => {
    if (resuming && !checkingRecovery && !recovery?.savedSubmission) beginRef.current();
  }, [resuming, checkingRecovery, recovery]);

  function goToReport() {
    navigate('/learn/report', { state: { session, subject } });
  }

  function moveOn(actions, nextProblemId) {
    const nextIndex = problems.findIndex((item) => item.problemId === nextProblemId);
    if (actions?.includes('finish_problems') || nextIndex < 0) {
      goToReport();
      return;
    }
    setRecovery(null);
    setBlocked(false);
    setIndex(nextIndex);
    setAnswer('');
    setWork('');
    setAttempt(null);
    setSolution(null);
    setError('');
    setPhase('solve');
  }

  async function openSolution(current = attempt) {
    setError('');
    setBusy('해설을 불러오고 있어요...');
    try {
      const result = await viewSolution(session.sessionId, current.problemId);
      setSolution(result);
      setPhase('solution');
    } catch (err) {
      fail(err, '해설을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      sendingRef.current = false;
      setBusy('');
    }
  }

  async function handleSubmit() {
    if (sendingRef.current || blocked || checkingRecovery || recovery?.savedSubmission) return;
    sendingRef.current = true;
    const body = { answer: answer.trim(), work: work.trim() };
    const fingerprint = `${problem.problemId}\n${body.answer}\n${body.work}`;
    if (submitRef.current?.fingerprint !== fingerprint) submitRef.current = { fingerprint, key: newKey() };
    setError('');
    setBusy('채점하고 있어요...');
    try {
      const result = await submitAttempt(session.sessionId, problem.problemId, body, submitRef.current.key);
      await receiveGrade(result, body);
    } catch (err) {
      if (err.code === 'FIRST_ATTEMPT_ALREADY_SUBMITTED') {
        submitRef.current = null;
        const next = problems[index + 1];
        if (next) moveOn(['next_problem'], next.problemId);
        else goToReport();
        return;
      }
      if (!canRetrySame(err) && !isTerminal(err)) submitRef.current = null;
      fail(err, '답안을 제출하지 못했어요. 잠시 후 다시 시도해 주세요.');
      if (err.code === 'AI_GENERATION_UNCERTAIN') {
        setError(`AI 채점 결과를 받지 못했어요. 저장 상태를 확인한 뒤 동일 답안 재채점 여부를 선택해 주세요.${err.requestId ? ` 문의 번호: ${err.requestId}` : ''}`);
      }
    } finally {
      sendingRef.current = false;
      setBusy('');
    }
  }

  async function receiveGrade(result, body) {
    submitRef.current = null;
    setRecovery(null);
    setBlocked(false);
    setAttempt(result);
    setSubmittedAnswer(body.answer);
    if (result.judgement === 'correct') await openSolution(result);
    else setPhase(result.judgement === 'wrong' ? 'wrong' : 'pending');
  }

  async function recoverGrade() {
    if (sendingRef.current || !recovery?.savedSubmission) return;
    const restoreOnly = ['result_available', 'completed'].includes(recovery.state);
    if (!restoreOnly && !recovery.retryAllowed) return;
    sendingRef.current = true;
    setRetryOpen(false);
    setBusy(restoreOnly ? '저장된 채점을 복원하고 있어요...' : '동일 답안을 한 번 재채점하고 있어요...');
    setError('');
    try {
      const authorization = restoreOnly ? null : await consentGradingRecovery(session.sessionId, recovery.attemptId);
      const { answer: savedAnswer, work: savedWork, idempotencyKey } = recovery.savedSubmission;
      // Preserve the exact saved strings, request key and attempt. Do not trim or create a new key.
      const body = { answer: savedAnswer, work: savedWork };
      const result = await submitAttempt(session.sessionId, recovery.problemId, body, idempotencyKey, authorization?.authorizationId);
      await receiveGrade(result, body);
    } catch (err) {
      fail(err, '재채점을 완료하지 못했어요. 저장 상태를 확인해 주세요.');
      setBlocked(true);
      setRecovery((saved) => ({ ...saved, retryAllowed: false, state: 'review_required' }));
    } finally {
      sendingRef.current = false;
      setBusy('');
    }
  }

  async function handleReteach() {
    setError('');
    setBusy('AI 학생을 부르고 있어요...');
    if (!reteachKeyRef.current) reteachKeyRef.current = newKey();
    try {
      const latest = await getSession(session.sessionId);
      const next = await startProblemReteach(
        session.sessionId,
        attempt.problemId,
        { attemptId: attempt.attemptId, expectedVersion: latest.version },
        reteachKeyRef.current,
      );
      reteachKeyRef.current = null;
      navigate('/learn/chat', { state: { session: next, subject } });
    } catch (err) {
      if (!canRetrySame(err) && !isTerminal(err)) reteachKeyRef.current = null;
      fail(err, '다시 설명을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setBusy('');
    }
  }

  if (session.stage === 'report') return <Navigate to="/learn/report" replace state={{ session, subject }} />;
  if (session.stage !== 'problem') {
    return <Navigate to={STAGE_ROUTES[session.stage] ?? '/learn'} replace state={{ session, subject }} />;
  }

  let content = null;
  let footer;
  const errorLine = <>
    {error && <InlineError>{error}</InlineError>}
    {(blocked || recovery?.savedSubmission || error) && <section aria-label="채점 복구">
      {recovery?.savedSubmission && <p>제출한 답안은 저장되어 있어요. 같은 답안과 시도 번호로 이어갑니다.</p>}
      {recovery?.state === 'retry_available' && <p>이전 AI 요청의 결과를 받지 못했어요. 안내를 확인하고 동일 답안을 한 번 재채점할 수 있어요.</p>}
      {recovery?.state === 'running' && <p>요청이 진행 중이에요. 자동으로 다시 요청하지 않습니다.</p>}
      {recovery?.state === 'review_required' && <p>저장 결과 확인이 필요해요. 상태 확인으로 결과를 조회할 수 있으며 AI 요청은 보내지 않아요.</p>}
      {recovery?.state === 'exhausted' && <p>추가 재채점 한도를 사용했어요. 답안은 보존됩니다. 지원 담당자에게 문의해 주세요.</p>}
      <Button variant="secondary" onClick={checkRecovery} disabled={Boolean(busy) || checkingRecovery}>
        {checkingRecovery ? '저장 상태 확인 중...' : '저장 상태 확인'}
      </Button>
      {recovery?.retryAllowed && <Button onClick={() => setRetryOpen(true)} disabled={Boolean(busy) || checkingRecovery}>동일 답안 재채점</Button>}
      {['result_available', 'completed'].includes(recovery?.state) && <Button onClick={recoverGrade} disabled={Boolean(busy) || checkingRecovery}>저장된 채점 복원</Button>}
    </section>}
  </>;
  const showCounter = total > 0 && phase !== 'intro' && phase !== 'loading';

  if (phase === 'intro' || phase === 'loading') {
    content = (
      <div className={styles.intro}>
        <img src={emotionMint} alt="" width="120" height="120" />
        <h2 className={styles.introTitle}>이제 혼자 풀어 볼 차례예요</h2>
        <p className={styles.introText}>
          AI 학생에게 설명한 내용이 새로운 상황에서도 통하는지 확인해요. 천천히 풀어도 괜찮아요.
        </p>
        <ul className={styles.guide}>
          {PROBLEM_GUIDE.map((item) => (
            <li key={item.tag}>
              <span className={styles.guideTag}>
                <Tag tone={item.tone}>{item.tag}</Tag>
              </span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
        {errorLine}
      </div>
    );
    footer = (
      <BottomCTA>
        <Button onClick={begin} disabled={Boolean(busy) || blocked || checkingRecovery}>
          {busy || '문제 풀기 시작'}
        </Button>
      </BottomCTA>
    );
  }

  if (phase === 'solve' && problem) {
    content = (
      <div className={styles.solve}>
        <div>
          <h2 className={styles.heading}>새로운 상황에 적용해 보세요</h2>
          <p className={styles.alone}>
            <img src={lockIcon} alt="" width="14" height="14" />
            힌트 없이 혼자 풀어요
          </p>
        </div>
        <section className={styles.card} aria-labelledby="problem-label">
          <p id="problem-label" className={styles.cardTitle}>
            문제 {problem.sequence}
          </p>
          <p className={styles.question}>{problem.question}</p>
        </section>
        <TextField
          label="답"
          placeholder="답을 입력해 주세요"
          value={answer}
          readOnly={Boolean(recovery?.savedSubmission) || blocked || Boolean(busy)}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={2000}
        />
        <TextField
          label="풀이 과정과 이유"
          multiline
          placeholder="계산 과정과 그렇게 푼 이유를 적어 주세요"
          value={work}
          readOnly={Boolean(recovery?.savedSubmission) || blocked || Boolean(busy)}
          onChange={(event) => setWork(event.target.value)}
          maxLength={4000}
        />
        {errorLine}
      </div>
    );
    footer = (
      <BottomCTA>
        <Button disabled={!answer.trim() || !work.trim() || Boolean(busy) || blocked || checkingRecovery || Boolean(recovery?.savedSubmission)} onClick={handleSubmit}>
          {busy || '답안 제출'}
        </Button>
      </BottomCTA>
    );
  }

  if (phase === 'wrong' && problem) {
    const canReteach = attempt.attemptNo === 1 && attempt.availableActions?.includes('reteach');
    content = (
      <div className={styles.result}>
        <h2 className={styles.resultTitle}>문제 {problem.sequence} 결과</h2>
        <section className={`${styles.card} ${styles.summaryCard}`}>
          <p className={styles.smallLabel}>문제</p>
          <p className={styles.summary}>{problem.question}</p>
        </section>
        <section className={styles.notYet}>
          <div className={styles.notYetHead}>
            <img src={retryIcon} alt="" width="36" height="36" />
            <h3>아직 정답이 아니에요</h3>
          </div>
          <p className={styles.myAnswer}>
            <span>내 답</span>
            <strong>{submittedAnswer}</strong>
          </p>
        </section>
        {canReteach && (
          <div className={styles.aiGap}>
            <AiMessage avatar={bubbleConfused}>{AI_ASK}</AiMessage>
          </div>
        )}
        {errorLine}
      </div>
    );
    footer = canReteach ? (
      <BottomCTA stacked>
        <Button onClick={handleReteach} disabled={Boolean(busy) || blocked || checkingRecovery}>
          {busy && busy.startsWith('AI') ? busy : 'AI 학생에게 다시 설명하기'}
        </Button>
        <Button variant="secondary" onClick={() => openSolution()} disabled={Boolean(busy)}>
          해설 보기
        </Button>
      </BottomCTA>
    ) : (
      <BottomCTA>
        <Button onClick={() => openSolution()} disabled={Boolean(busy)}>
          {busy || '해설 보기'}
        </Button>
      </BottomCTA>
    );
  }

  if (phase === 'pending' && problem) {
    content = (
      <div className={styles.result}>
        <h2 className={styles.resultTitle}>문제 {problem.sequence} 결과</h2>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>채점을 확인하고 있어요</h3>
          <p className={styles.solutionText}>
            이 답은 바로 판단하기 어려워서 보류했어요. 오답으로 처리되지 않아요.
          </p>
        </section>
      </div>
    );
    footer = (
      <BottomCTA>
        <Button onClick={() => moveOn(attempt.availableActions, attempt.nextProblemId)}>
          {attempt.availableActions?.includes('finish_problems') ? '성장 리포트 보기' : '다음 문제'}
          <img src={arrowIcon} alt="" width="18" height="18" />
        </Button>
      </BottomCTA>
    );
  }

  if (phase === 'solution' && problem && solution) {
    const correct = attempt?.judgement === 'correct';
    const finish = solution.availableActions?.includes('finish_problems');
    content = (
      <div className={`${styles.result} ${styles.solution}`}>
        <h2 className={styles.resultTitle}>문제 {problem.sequence} 해설</h2>
        <div className={styles.answers}>
          <section className={`${styles.answerCard} ${correct ? styles.answerRight : ''}`}>
            <p className={styles.smallLabel}>내 답</p>
            <p className={styles.answerValue}>{submittedAnswer}</p>
            {correct && <Tag tone="ok">정답</Tag>}
          </section>
          <section className={`${styles.answerCard} ${styles.answerKey}`}>
            <p className={styles.smallLabel}>정답</p>
            <p className={styles.answerValue}>{solution.answer}</p>
          </section>
        </div>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>풀이</h3>
          <p className={styles.solutionText}>{solution.solution}</p>
        </section>
      </div>
    );
    footer = (
      <BottomCTA>
        <Button onClick={() => moveOn(solution.availableActions, solution.nextProblemId)}>
          {finish ? '성장 리포트 보기' : `다음 문제 (${index + 2}/${total})`}
          <img src={arrowIcon} alt="" width="18" height="18" />
        </Button>
      </BottomCTA>
    );
  }

  return (
    <AppShell
      fill={phase === 'intro' || phase === 'loading'}
      header={
        <>
          <AppBar
            title="응용문제"
            onBack={() => (phase === 'intro' ? navigate('/home') : setLeaveOpen(true))}
            counter={showCounter ? `${index + 1} / ${total}` : undefined}
          />
          <StepBar current={4} label="문제 풀이" />
        </>
      }
      footer={footer}
    >
      {content}
      <Dialog open={retryOpen} onClose={() => setRetryOpen(false)} title="동일 답안을 다시 채점할까요?"
        actions={<>
          <Button variant="secondary" onClick={() => setRetryOpen(false)}>취소</Button>
          <Button onClick={recoverGrade} disabled={Boolean(busy)}>확인하고 1회 재채점</Button>
        </>}>
        이전 요청이 AI에서 이미 처리됐을 수도 있어요. 다시 채점하면 추가 AI 사용량이 발생할 수 있습니다.
        저장된 답안은 그대로 사용하며 자동 재시도는 하지 않습니다.
      </Dialog>
      <Dialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        character={<img src={bubbleSad} alt="" width="56" height="56" />}
        title="문제 풀이를 멈출까요?"
        actions={
          <>
            <Button size="md" variant="secondary" onClick={() => navigate('/home')}>
              나가기
            </Button>
            <Button size="md" onClick={() => setLeaveOpen(false)}>
              계속 풀기
            </Button>
          </>
        }
      >
        제출한 답은 저장돼요.
        <br />
        홈에서 이어서 풀 수 있어요.
      </Dialog>
    </AppShell>
  );
}
