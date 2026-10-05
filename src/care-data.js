export const sources = {
  nice:{name:'NICE · 成人广泛性焦虑与惊恐障碍指南',url:'https://www.nice.org.uk/guidance/cg113/chapter/Recommendations'},
  breath:{name:'NHS · 压力下的舒适呼吸练习',url:'https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/'},
  whoSkills:{name:'WHO · Doing What Matters in Times of Stress',url:'https://www.who.int/publications/i/item/9789240003927'},
  worry:{name:'NHS · Tackling your worries',url:'https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/tackling-your-worries/'},
  thought:{name:'NHS · Thought record',url:'https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/thought-record/'},
  problem:{name:'NHS · Problem-solving',url:'https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/problem-solving/'},
  work:{name:'WHO · Mental health at work',url:'https://www.who.int/news-room/fact-sheets/detail/mental-health-at-work'},
  sleep:{name:'NHS · 睡眠与心理健康',url:'https://www.nhs.uk/every-mind-matters/mental-health-issues/sleep/'},
  move:{name:'WHO · 身体活动',url:'https://www.who.int/news-room/fact-sheets/detail/physical-activity'},
};
export const methods = [
  {id:'settle',title:'先让呼吸舒服一点',short:'舒适呼吸',group:'body',label:'身体安顿',time:'约 2 分钟',icon:'wind',color:'sage',
    intro:'跟着一个温和的节奏，或照自己的呼吸来。',output:'带走一个回到当下的小动作',fit:'身体紧绷，想先停一小会儿。',limit:'节奏不是要求。不必深吸或憋气；头晕、憋闷或更焦虑就停止，也可以换成观察周围。',
    evidence:'借鉴 NHS 舒适呼吸指导，用于当下的自我调节。本页面的短练习未单独验证疗效，不替代焦虑治疗。',sources:['breath']},
  {id:'ground',title:'把注意力带回这里',short:'回到当下',group:'body',label:'当下觉察',time:'按自己的节奏',icon:'eye',color:'blue',
    intro:'看看身边，感受支撑，选一件眼前的小事。',output:'带走一个愿意继续的行动',fit:'念头很吵，想暂时把注意力放回身边。',limit:'可以睁眼、不必清空念头。身体觉察不舒服时，改为看一个外部物体，或停下。',
    evidence:'借鉴 WHO 压力应对指南中的 grounding 技能。是应对压力的技能练习，不是对创伤或焦虑障碍的单独治疗。',sources:['whoSkills']},
  {id:'worry',title:'给担忧分一条路',short:'担忧分流',group:'mind',label:'担忧管理',time:'约 3–5 分钟',icon:'cloud',color:'violet',
    intro:'这件事现在能处理，还是脑中在预演“万一”？',output:'带走一个行动或担忧时段安排',fit:'脑子反复想同一件事，一时停不下来。',limit:'延后处理不是压住念头，也不适用于应该马上处理的真实危险。担忧时段只是自己安排，不会自动提醒。',
    evidence:'借鉴 NHS 的担忧树与担忧时段方法。完整 CBT 自助需要连续练习；一次分流不等于完成治疗。',sources:['worry','nice']},
  {id:'reframe',title:'分清事实和推测',short:'认知梳理',group:'mind',label:'认知行为方法',time:'约 5–8 分钟',icon:'grid',color:'peach',
    intro:'不急着说服自己乐观，先看看有什么证据。',output:'带走一句更贴近事实的理解',fit:'一次反馈、一个消息，让你想到了最坏的结局。',limit:'真实超负荷、歧视或欺凌需要现实支持，不能靠改变想法来合理化。',
    evidence:'借鉴 NHS 的 CBT 想法记录。CBT 有指南支持；此交互只是其中一个技能，不是完整 CBT 疗程。',sources:['thought','nice']},
  {id:'plan',title:'把一件难事拆小',short:'问题解决',group:'work',label:'现实问题',time:'约 4–6 分钟',icon:'steps',color:'sage',
    intro:'摆出两个可行做法，选一个此刻能迈出的步骤。',output:'带走一张具体的下一步行动卡',fit:'有明确的问题，却被事情的体量卡住了。',limit:'只处理你能够影响的部分。资源不足时，寻求支持本身也是一个可行步骤。',
    evidence:'借鉴 NHS 的结构化问题解决方法，帮助把问题转成可执行计划。做了计划不代表压力来源已经解决。',sources:['problem']},
  {id:'boundary',title:'让工作边界说得清',short:'边界协商',group:'work',label:'工作量与支持',time:'约 4–6 分钟',icon:'message',color:'blue',
    intro:'把任务、时间和取舍说清楚，留下一份沟通草稿。',output:'带走一段可以自行修改的表达',fit:'任务不断加进来，需要确认优先级或争取支持。',limit:'草稿不会自动发送。如果直接沟通不安全，可以先找可信的人、合适的员工支持渠道或专业支持。',
    evidence:'WHO 强调工作条件、工作量和支持的重要性。此沟通工具是产品设计，尚无本工具独立有效性的证据。',sources:['work']},
];
export const needs = [
  {id:'body',title:'身体很紧绷',description:'先给自己一点缓冲',icon:'wind'},
  {id:'mind',title:'脑中想个不停',description:'把担忧和事实分开',icon:'cloud'},
  {id:'work',title:'事情多到扛不住',description:'找下一步与支持',icon:'steps'},
];
export const methodById = id => methods.find(method => method.id === id);
