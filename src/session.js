import { isAssessment } from './assessment-data.js';

export function resolveSessionRoute(requested, { before, complete }) {
  let route = requested || 'checkin';
  if (!isAssessment(before)) return 'checkin';
  if (['home', 'checkin', 'main'].includes(route)) return complete ? 'result' : 'checkin-result';
  if (route === 'result' && !complete) return 'checkin-result';
  if (complete && (['checkin-result', 'spaces', 'arcade', 'choose'].includes(route) || route.startsWith('play/'))) return 'result';
  return route;
}

export function summarizeSession(before, after) {
  if (!isAssessment(before) || !isAssessment(after) || before.gameId !== after.gameId) {
    return { direction: 'unpaired', delta: null, title: '留下一次此刻的记录',
      detail: '没有两轮完整的同类任务，不计算前后差异。' };
  }
  const delta = after.score - before.score;
  if (delta > 0) return { direction: 'higher', delta, title: '这一轮，任务得分更高了。',
    detail: `同一种任务的得分提高了 ${delta} 分。这里只比较两轮判断表现，不用于判断压力是否下降。` };
  if (delta < 0) return { direction: 'lower', delta, title: '这一轮，得分低了一些。',
    detail: `同一种任务的得分降低了 ${Math.abs(delta)} 分。这是本轮表现的变化，也可以选择先休息。` };
  return { direction: 'same', delta, title: '这两轮，得分相同。',
    detail: '任务得分保持不变。你也可以看看情境中的选择有没有变化，不需要追求更高分。' };
}
