import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { consentGradingRecovery, getGradingRecovery, startProblems, submitAttempt } from '../../api/assessment';
import LiveProblem from './LiveProblem';

vi.mock('../../api/assessment', () => ({ consentGradingRecovery: vi.fn(), getGradingRecovery: vi.fn(), startProblems: vi.fn(),
  submitAttempt: vi.fn(), viewSolution: vi.fn(), startProblemReteach: vi.fn() }));
const sessionId = '64a17d91-4b37-4194-bb06-7e6974e08ea4';
const authorizationId = '619e6188-7dc2-4c2e-9b37-80afcfac318d';
const problems = [{ problemId: 'p1', sequence: 1, question: '합성 문제 1' }, { problemId: 'p2', sequence: 2, question: '합성 문제 2' }];
function saved(state = 'retry_available') {
  return { state, retryAllowed: state === 'retry_available', attemptId: 'a2', problemId: 'p2', problems,
    savedSubmission: { answer: '  90000  ', work: ' 원가를 배분합니다. ', idempotencyKey: 'original-key' } };
}
function mount(extra = {}) {
  return render(<MemoryRouter><LiveProblem session={{ sessionId, stage: 'problem', ...extra }} subject="합성 개념" /></MemoryRouter>);
}
async function confirm() {
  fireEvent.click(await screen.findByRole('button', { name: '동일 답안 재채점' }));
  return screen.getByRole('button', { name: '확인하고 1회 재채점' });
}
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  getGradingRecovery.mockResolvedValue(saved());
  consentGradingRecovery.mockResolvedValue({ authorizationId });
  submitAttempt.mockResolvedValue({ attemptId: 'a2', problemId: 'p2', attemptNo: 1, judgement: 'pending_review', availableActions: ['finish_problems'] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('owner-confirmed one-time grading recovery', () => {
  it('restores the saved second answer on reconnect without automatically generating or grading', async () => {
    mount();
    expect((await screen.findByLabelText('답')).value).toBe('  90000  ');
    expect(screen.getByLabelText('풀이 과정과 이유').value).toBe(' 원가를 배분합니다. ');
    expect(screen.getByLabelText('답').readOnly).toBe(true);
    expect(screen.getByText('합성 문제 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '답안 제출' }).disabled).toBe(true);
    expect(startProblems).not.toHaveBeenCalled();expect(submitAttempt).not.toHaveBeenCalled();expect(consentGradingRecovery).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTime(120000));
    expect(submitAttempt).not.toHaveBeenCalled();expect(getGradingRecovery).toHaveBeenCalledTimes(1);
  });

  it('requires visible consent and preserves exact body and key on rapid double clicks', async () => {
    mount();
    const button = await confirm();
    expect(screen.getByText(/추가 AI 사용량/)).toBeTruthy();
    expect(consentGradingRecovery).not.toHaveBeenCalled();
    let resolve;
    submitAttempt.mockReturnValue(new Promise((done) => { resolve = done; }));
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(submitAttempt).toHaveBeenCalledTimes(1));
    expect(consentGradingRecovery).toHaveBeenCalledExactlyOnceWith(sessionId, 'a2');
    expect(submitAttempt).toHaveBeenCalledWith(sessionId, 'p2', { answer: '  90000  ', work: ' 원가를 배분합니다. ' }, 'original-key', authorizationId);
    await act(async () => resolve({ problemId: 'p2', attemptId: 'a2', judgement: 'pending_review', availableActions: ['finish_problems'] }));
    expect(await screen.findByText('채점을 확인하고 있어요')).toBeTruthy();
    expect(screen.queryByText('아직 정답이 아니에요')).toBeNull();
  });

  it('cancelling consent never dispatches the saved answer', async () => {
    mount();await confirm();fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(consentGradingRecovery).not.toHaveBeenCalled();expect(submitAttempt).not.toHaveBeenCalled();
  });

  it.each([502, 503])('locks recovery after %s and only checks saved status on demand', async (status) => {
    submitAttempt.mockRejectedValue(new ApiError(status, status === 503 ? 'AI_GENERATION_UNCERTAIN' : 'INVALID_GEMINI_RESPONSE', '',
      { recovery: { action: 'review_required', retryAllowed: false } }));
    mount();fireEvent.click(await confirm());await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: '동일 답안 재채점' })).toBeNull();
    getGradingRecovery.mockResolvedValue(saved('exhausted'));
    fireEvent.click(screen.getByRole('button', { name: '저장 상태 확인' }));
    await screen.findByText(/추가 재채점 한도를/);
    expect(submitAttempt).toHaveBeenCalledTimes(1);
  });

  it('restores a cached verdict by explicit submission without consent or a recovery header', async () => {
    getGradingRecovery.mockResolvedValue(saved('result_available'));
    mount();fireEvent.click(await screen.findByRole('button', { name: '저장된 채점 복원' }));
    await screen.findByText('채점을 확인하고 있어요');
    expect(consentGradingRecovery).not.toHaveBeenCalled();
    expect(submitAttempt).toHaveBeenCalledExactlyOnceWith(sessionId, 'p2', { answer: '  90000  ', work: ' 원가를 배분합니다. ' }, 'original-key', undefined);
  });

  it('checks state before ordinary problem start and does not call POST on mount', async () => {
    getGradingRecovery.mockResolvedValue({ state: 'none', retryAllowed: false });
    startProblems.mockResolvedValue({ problems });
    mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '문제 풀기 시작' }).disabled).toBe(false));
    expect(startProblems).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기 시작' }));
    await screen.findByText('합성 문제 1');expect(startProblems).toHaveBeenCalledTimes(1);
  });

  it('does not show a retry button or dispatch when only an unresolved receipt remains', async () => {
    getGradingRecovery.mockResolvedValue(saved('review_required'));
    mount();await screen.findByLabelText('답');
    expect(screen.queryByRole('button', { name: '동일 답안 재채점' })).toBeNull();
    expect(submitAttempt).not.toHaveBeenCalled();
  });
});
