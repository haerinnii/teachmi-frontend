import { newKey, request } from './client';

export function getHome() {
  return request('/home');
}

export function startProblems(sessionId) {
  return request(`/sessions/${sessionId}/problems`, { method: 'POST' });
}

export function submitAttempt(sessionId, problemId, { answer, work }, idempotencyKey, recoveryAuthorization) {
  return request(`/sessions/${sessionId}/problems/${problemId}/attempts`, {
    method: 'POST',
    body: { answer, work },
    idempotencyKey,
    recoveryAuthorization,
  });
}

// Both requests are free of AI generation. A later explicit submit consumes consent at most once.
export function getGradingRecovery(sessionId) {
  return request(`/sessions/${sessionId}/grading-recovery`);
}

export function consentGradingRecovery(sessionId, attemptId) {
  return request(`/sessions/${sessionId}/grading-recovery/consent`, {
    method: 'POST', body: { attemptId, acceptDuplicateCall: true },
  });
}

export function startProblemReteach(sessionId, problemId, { attemptId, expectedVersion }, idempotencyKey = newKey()) {
  return request(`/sessions/${sessionId}/problems/${problemId}/reteach`, {
    method: 'POST',
    body: { attemptId, expectedVersion },
    idempotencyKey,
  });
}

export function viewSolution(sessionId, problemId) {
  return request(`/sessions/${sessionId}/problems/${problemId}/solution`, { method: 'POST' });
}

export function getReport(sessionId) {
  return request(`/sessions/${sessionId}/report`);
}

export function publishReport(sessionId, idempotencyKey = newKey()) {
  return request(`/sessions/${sessionId}/report`, { method: 'POST', idempotencyKey });
}

export function confirmReport(sessionId, idempotencyKey = newKey()) {
  return request(`/sessions/${sessionId}/report/confirm`, { method: 'POST', idempotencyKey });
}

export function relearn(sessionId, problemId, idempotencyKey = newKey()) {
  return request(`/sessions/${sessionId}/relearn`, {
    method: 'POST',
    body: problemId ? { problemId } : {},
    idempotencyKey,
  });
}
