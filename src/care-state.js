import { methodById } from './care-data.js';

export function makeCareRecord(payload, now = Date.now()) {
  const method = methodById(payload?.id);
  if (!method || !Array.isArray(payload.summary) || !payload.summary.length
    || typeof payload.nextAction !== 'string' || !payload.nextAction.trim()) return null;
  const summary = payload.summary.filter(item => item && typeof item.label === 'string'
    && typeof item.value === 'string' && item.value.trim())
    .map(item => ({label:item.label,value:item.value}));
  if (!summary.length) return null;
  return {
    id:method.id, title:method.short, summary, nextAction:payload.nextAction.trim(),
    isExample:payload.isExample === true, createdAt:now, feedback:null,
  };
}
export const personalRecords = records => records.filter(record => record && !record.isExample);
export function feedbackFor(choice) {
  return ({
    better:{title:'记住这一刻对你有用的部分。',text:'这是你此刻的感受，不代表焦虑已被治疗。看看接下来那一步是否适合现在去做。',offerSupport:false},
    same:{title:'没有明显变化，也可以如实留下。',text:'没有明显变化不代表你做错了。可以换一种方式，也可以休息或寻求支持。',offerSupport:false},
    worse:{title:'先停下，不需要坚持完成更多。',text:'如果这个练习让你更难受，请停止，回到舒服的环境，必要时联系可信的人或专业支持。',offerSupport:true},
    unsure:{title:'暂时说不上来，也没关系。',text:'不必马上判断效果。你仍可以决定下一步做什么，或者今天先到这里。',offerSupport:false},
  })[choice] || null;
}
