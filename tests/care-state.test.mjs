import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCareRecord, feedbackFor, personalRecords } from '../src/care-state.js';

const completed = {
  id:'plan', title:'自定义标题', summary:[{label:'问题',value:'两个任务撞在一起'}],
  nextAction:'明早先确认优先级', isExample:false,
};
test('unfinished or unknown practices cannot produce a completion record', () => {
  for (const value of [null, {}, {...completed,id:'target'}, {...completed,nextAction:' '}, {...completed,summary:[]}]) {
    assert.equal(makeCareRecord(value), null);
  }
});
test('records preserve a concrete next action without creating a clinical score', () => {
  const record = makeCareRecord(completed, 1234);
  assert.equal(record.nextAction, completed.nextAction);
  assert.equal(record.createdAt, 1234);
  assert.notEqual(record.title, completed.title);
  assert.equal(record.score, undefined);
  assert.notEqual(record.summary, completed.summary);
});
test('confirmed long drafts and actions are saved without losing the ending', () => {
  const draft = '工作安排。'.repeat(700) + '请先不要转达，我想先确认安全的支持方式。';
  const nextAction = '待核对。'.repeat(800) + '核对后再决定是否沟通。';
  const record = makeCareRecord({
    ...completed, id:'boundary', summary:[{label:'沟通草稿',value:draft}], nextAction,
  });
  assert.equal(record.summary[0].value, draft);
  assert.equal(record.nextAction, nextAction);
});
test('example walkthroughs never become the users personal progress', () => {
  const example = makeCareRecord({...completed,isExample:true});
  const own = makeCareRecord(completed);
  assert.deepEqual(personalRecords([example,own]), [own]);
});
test('neutral and worse feedback are not converted into improvement', () => {
  assert.equal(feedbackFor('worse').offerSupport, true);
  assert.equal(feedbackFor('same').offerSupport, false);
  assert.match(feedbackFor('same').text, /没有明显变化/);
  assert.match(feedbackFor('better').text, /不代表/);
  assert.equal(feedbackFor('invented'), null);
});
