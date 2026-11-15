import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import bubbleConfused from '../../assets/characters/bubble-confused.png';
import bubbleCurious from '../../assets/characters/bubble-curious.png';
import bubbleSad from '../../assets/characters/bubble-sad.png';
import emotionMint from '../../assets/characters/emotion-mint.png';
import arrowIcon from '../../assets/icons/arrow-right.svg';
import checkIcon from '../../assets/icons/check-ok.svg';
import lockIcon from '../../assets/icons/lock.svg';
import retryIcon from '../../assets/icons/retry.svg';
import wrongIcon from '../../assets/icons/wrong.svg';
import AiMessage from '../../components/AiMessage/AiMessage';
import AppBar from '../../components/AppBar/AppBar';
import AppShell from '../../components/AppShell/AppShell';
import BottomCTA from '../../components/BottomCTA/BottomCTA';
import Button from '../../components/Button/Button';
import Dialog from '../../components/Dialog/Dialog';
import StepBar from '../../components/StepBar/StepBar';
import Tag from '../../components/Tag/Tag';
import TextField from '../../components/TextField/TextField';
import SessionGate from '../../learning/SessionGate';
import useLearningSession from '../../learning/useLearningSession';
import LiveProblem from './LiveProblem';
import { PROBLEM_GUIDE, PROBLEMS, RETEACH_REPLY } from './problemSamples';
import styles from './ProblemPage.module.css';

function formatNumber(value) {
  return value.toLocaleString('ko-KR');
}

function emptyRecord() {
  return { tries: [], reteach: '', revealed: false };
}

function initialPhase(state) {
  return ['solve', 'wrong', 'reteach', 'solution'].includes(state) ? state : 'intro';
}

export default function ProblemPage() {
  const { live, session, loadError, subject } = useLearningSession({ verifyOnMount: true });

  if (!live) return <DemoProblem />;
  if (!session) return <SessionGate loadError={loadError} header={<AppBar title="응용문제" />} />;
  return <LiveProblem session={session} subject={subject} />;
}

function DemoProblem() {
  const navigate = useNavigate();
  const location = useLocation();
  const demo = new URLSearchParams(location.search).get('state');
  const [phase, setPhase] = useState(() => initialPhase(demo));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [work, setWork] = useState('');
  const [reteachText, setReteachText] = useState('');
  const [records, setRecords] = useState(() =>
    PROBLEMS.map((problem, i) =>
      demo && demo !== 'solve' && i === 0 ? { ...emptyRecord(), tries: [{ answer: 3000000, correct: false }] } : emptyRecord(),
    ),
  );
  const [leaveOpen, setLeaveOpen] = useState(false);

  const problem = PROBLEMS[index];
  const record = records[index];
  const lastTry = record.tries.at(-1);
  const total = PROBLEMS.length;
  const isLast = index === total - 1;

  function updateRecord(patch) {
    setRecords((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function handleSubmit() {
    const value = Number(answer.replaceAll(',', ''));
    const correct = value === problem.answer;
    const tries = [...record.tries, { answer: value, correct, work: work.trim() }];
    updateRecord({ tries });
    if (correct || tries.length > 1) setPhase('solution');
    else setPhase('wrong');
  }

  function handleReteach() {
    updateRecord({ reteach: reteachText.trim() });
    setAnswer('');
    setWork('');
    setReteachText('');
    setPhase('solve');
  }

  function handleNext() {
    if (isLast) {
      navigate('/learn/report', { state: { ...location.state, problems: records } });
      return;
    }
    setIndex(index + 1);
    setAnswer('');
    setWork('');
    setPhase('solve');
  }

  let content;
  let footer;

  if (phase === 'intro') {
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
      </div>
    );
    footer = (
      <BottomCTA>
        <Button onClick={() => setPhase('solve')}>문제 풀기 시작</Button>
      </BottomCTA>
    );
  }

  if (phase === 'solve') {
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
            문제 {index + 1}
          </p>
          <p className={styles.question}>
            {problem.question.map((part) => (part.strong ? <strong key={part.text}>{part.text}</strong> : part.text))}
          </p>
          <dl className={styles.facts}>
            {problem.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd className={fact.mono ? styles.mono : undefined}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <TextField
          label="답"
          unit="원"
          mono
          inputMode="numeric"
          placeholder="숫자만 입력"
          value={answer}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 12);
            setAnswer(digits ? formatNumber(Number(digits)) : '');
          }}
        />
        <TextField
          label="풀이 과정과 이유"
          multiline
          placeholder="계산 과정과 그렇게 푼 이유를 적어 주세요"
          value={work}
          onChange={(event) => setWork(event.target.value)}
          maxLength={1000}
        />
      </div>
    );
    footer = (
      <BottomCTA>
        <Button disabled={!answer} onClick={handleSubmit}>
          답안 제출
        </Button>
      </BottomCTA>
    );
  }

  if (phase === 'wrong') {
    content = (
      <div className={styles.result}>
        <h2 className={styles.resultTitle}>문제 {index + 1} 결과</h2>
        <section className={`${styles.card} ${styles.summaryCard}`}>
          <p className={styles.smallLabel}>문제</p>
          <p className={styles.summary}>{problem.summary}</p>
        </section>
        <section className={styles.notYet}>
          <div className={styles.notYetHead}>
            <img src={retryIcon} alt="" width="36" height="36" />
            <h3>아직 정답이 아니에요</h3>
          </div>
          <p className={styles.myAnswer}>
            <span>내 답</span>
            <strong>{formatNumber(lastTry?.answer ?? 0)}원</strong>
          </p>
          <p className={styles.recheckLabel}>다시 볼 부분</p>
          <p className={styles.recheck}>{problem.recheck}</p>
        </section>
        <div className={styles.aiGap}>
          <AiMessage avatar={bubbleConfused}>{problem.aiAsk}</AiMessage>
        </div>
      </div>
    );
    footer = (
      <BottomCTA stacked>
        <Button onClick={() => setPhase('reteach')}>AI 학생에게 다시 설명하기</Button>
        <Button
          variant="secondary"
          onClick={() => {
            updateRecord({ revealed: true });
            setPhase('solution');
          }}
        >
          해설 보기
        </Button>
      </BottomCTA>
    );
  }

  if (phase === 'reteach') {
    content = (
      <div className={styles.result}>
        <h2 className={styles.resultTitle}>다시 설명하기</h2>
        <AiMessage avatar={bubbleCurious}>{problem.aiAsk}</AiMessage>
        <TextField
          label="내 설명"
          multiline
          placeholder="AI 학생에게 설명해 주세요"
          value={reteachText}
          onChange={(event) => setReteachText(event.target.value)}
          hint={`설명을 보내면 "${RETEACH_REPLY}" 하고 문제를 한 번 더 풀어요.`}
          maxLength={1000}
        />
      </div>
    );
    footer = (
      <BottomCTA>
        <Button disabled={!reteachText.trim()} onClick={handleReteach}>
          설명 보내고 다시 풀기
        </Button>
      </BottomCTA>
    );
  }

  if (phase === 'solution') {
    const correct = Boolean(lastTry?.correct);
    const points = correct ? problem.rightPoints.map((text) => ({ ok: true, text })) : problem.wrongPoints;
    content = (
      <div className={`${styles.result} ${styles.solution}`}>
        <h2 className={styles.resultTitle}>문제 {index + 1} 해설</h2>
        <div className={styles.answers}>
          <section className={`${styles.answerCard} ${correct ? styles.answerRight : ''}`}>
            <p className={styles.smallLabel}>내 답</p>
            <p className={styles.answerValue}>{formatNumber(lastTry?.answer ?? 0)}</p>
            {correct && <Tag tone="ok">정답</Tag>}
          </section>
          <section className={`${styles.answerCard} ${styles.answerKey}`}>
            <p className={styles.smallLabel}>정답</p>
            <p className={styles.answerValue}>{formatNumber(problem.answer)}</p>
            <Tag tone="lime">{problem.unit}</Tag>
          </section>
        </div>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>풀이</h3>
          <p className={styles.formula}>
            {problem.formula.map((part) => (part.mark ? <mark key={part.text}>{part.text}</mark> : part.text))}
          </p>
          <ul className={styles.years} style={{ gridTemplateColumns: `repeat(${problem.years.length}, minmax(0, 1fr))` }}>
            {problem.years.map((amount, i) => (
              <li key={`${amount}-${i}`}>
                <span>{i + 1}년차</span>
                <strong>{amount}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>내 풀이에서 확인된 점</h3>
          <ul className={styles.points}>
            {points.map((point) => (
              <li key={point.text}>
                {point.ok ? (
                  <span className={styles.okDot}>
                    <img src={checkIcon} alt="맞은 점" width="14" height="14" />
                  </span>
                ) : (
                  <img src={wrongIcon} alt="고칠 점" width="22" height="22" />
                )}
                {point.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
    footer = (
      <BottomCTA>
        <Button onClick={handleNext}>
          {isLast ? '성장 리포트 보기' : `다음 문제 (${index + 2}/${total})`}
          <img src={arrowIcon} alt="" width="18" height="18" />
        </Button>
      </BottomCTA>
    );
  }

  return (
    <AppShell
      fill={phase === 'intro'}
      header={
        <>
          <AppBar
            title="응용문제"
            onBack={() => (phase === 'intro' ? navigate(-1) : setLeaveOpen(true))}
            counter={phase === 'intro' ? undefined : `${index + 1} / ${total}`}
          />
          <StepBar current={4} label="문제 풀이" />
        </>
      }
      footer={footer}
    >
      {content}
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
        작성 중인 답은 저장돼요.
        <br />
        다시 들어오면 이 문제부터 이어서 풀어요.
      </Dialog>
    </AppShell>
  );
}
