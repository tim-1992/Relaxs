import { escapeHTML } from './ui.js';

// The host loads care-practices.css. No persistence, requests, or automatic messages.
const TITLES = {
  settle: '舒适呼吸', ground: '回到当下', worry: '担忧分流',
  reframe: '事实与推测', plan: '解决一件具体事', boundary: '工作边界与协商',
};
const META = {
  settle: ['给自己两分钟，呼吸不用表现得更好。', '保持平常、舒服的呼吸。圆环只是节奏参考，不必跟上，不憋气，也不用刻意深吸。出现头晕、气短或其他不适就停下，改为看看周围或退出。', '约 2 分钟'],
  ground: ['把一小部分注意力，放回此刻。', '睁着眼，依次留意周围、身体的支撑和环境声音。不用凑够数量，也不需要清空念头；不方便的感官步骤可以跳过。', '按自己的节奏'],
  worry: ['先看这件担忧，现在能做些什么。', '把一件担忧写下来，再决定是安排行动，还是留一个短时段慢慢想。担忧再次出现也没关系，不需要压抑或消灭它。', '约 3–5 分钟'],
  reframe: ['把已经发生的事，与脑中的推测分开。', '寻找更贴近事实的表达，不必强迫自己乐观。真实的超负荷、欺凌或不合理要求需要支持与工作条件的改变，不是靠换个想法承受下去。', '约 5–8 分钟'],
  plan: ['只处理一件具体的事。', '想出两个做法，看看各自需要什么，再选一个可尝试的小步骤。计划可以调整，不需要一次解决全部问题。', '约 4–6 分钟'],
  boundary: ['让手里的任务与可投入的时间，都被看见。', '整理一份可编辑的沟通草稿。如果直接沟通可能带来风险，可以先找可信的人讨论可行的支持方式，不必直接对抗。', '约 4–6 分钟'],
};
const NEXT_OPTIONS = [
  ['water', '喝几口水，稍作停留'],
  ['task', '回到手头任务，只做一个小步骤'],
  ['rest', '先休息一会儿'],
  ['support', '找一位可信的人说说'],
  ['custom', '写一个自己的小行动'],
];
const STRATEGIES = [
  ['delay', '协商延期', '说明目前安排，讨论一个可行的交付时间。'],
  ['scope', '缩小范围', '确认这次最需要交付的部分，其余另作安排。'],
  ['priority', '排出优先级', '让任务负责人明确先做哪项、哪项可以等待。'],
  ['support', '请求支持', '说明缺少的时间、信息或协作资源。'],
];
const field = (key, label, placeholder, extra = {}) => ({ key, label, placeholder, ...extra });
const choice = (key, label, options, extra = {}) => ({ key, label, options, type: 'choice', ...extra });
const nextFields = () => [
  choice('nextChoice', '接下来，想做哪一个小行动？', NEXT_OPTIONS),
  field('nextCustom', '你自己的小行动', '比如：打开文档，只写第一行标题', { when: d => d.nextChoice === 'custom' }),
];
const flow = (title, description, fields, extra = {}) => ({ title, description, fields, ...extra });

const FLOWS = {
  worry: [
    flow('先写一件担忧', '选此刻最占心的一件事，不必整理全部烦恼。', [
      field('worry', '我正在担忧什么？', '比如：明天评审可能来不及准备'),
    ]),
    flow('现在，有可以影响的一小步吗？', '不用判断担忧是否合理，只看现在有没有具体、可执行的动作。拿不准，也可以先选择暂时不能行动。', [
      choice('route', '这件担忧目前更接近哪一种？', [
        ['act', '具体、可处理的问题', '我能找到一个需要做或可以尝试的动作。'],
        ['later', '暂时不能行动，或是假设性的担忧', '目前没有可执行的步骤，或结果不由我控制。'],
      ]),
    ]),
    flow('给它一个合适的位置', '', [], { branch: 'worry' }),
    flow('再选一个眼前的小行动', '不必等担忧完全消失再行动。它再次出现时，可以承认它还在，再把注意力放回眼前。', nextFields()),
  ],
  reframe: [
    flow('先描述发生的情境', '像记录现场一样写下时间、事件或对方的原话，暂时不急着下结论。', [
      field('situation', '发生了什么？', '比如：评审结束后，负责人只说“明天再谈”'),
    ]),
    flow('脑中接着出现了什么？', '推测和感受都可以被记录。感受不需要被辩驳，也不需要打分。', [
      field('thought', '我的推测或脑中的话', '比如：他一定觉得我做得很差'),
      field('feeling', '这让我有什么感受？', '比如：担心、委屈，有点紧绷', { rows: 2 }),
    ]),
    flow('让事实有位置', '只写可观察到的信息，不强求两边一样多。如果还没有相关事实，可以如实写“目前不知道”。', [
      field('for', '哪些事实支持这个推测？', '比如：他指出了两处需要修改的内容'),
      field('against', '哪些事实不支持它，或说明还有其他可能？', '比如：他还没评价整体方案；会议确实超时了'),
    ]),
    flow('写一句更贴近事实的话', '可以保留不确定，也可以承认处境很难。无需把负面结论换成积极口号。', [
      field('balanced', '我愿意暂时采用的说法', '比如：有两处需要改，但目前还不知道他对整体的看法，我可以确认'),
    ]),
    flow('接下来，做一件小事', '小行动可以是澄清信息、照顾自己，或寻求支持。', nextFields()),
  ],
  plan: [
    flow('把问题缩到可以着手的大小', '用“哪件事遇到了什么阻碍”来描述，先不处理对自己的评价。', [
      field('problem', '这次要处理的具体问题', '比如：周五要交报告，还缺同事的一组数据'),
    ]),
    flow('第一个可能的做法', '写一个可尝试的方案，再看看它需要多少时间、精力或协调。', [
      field('optionA', '做法 A', '比如：先发数据清单，请对方确认能提供的时间'),
      field('costA', 'A 的成本或限制', '比如：需要整理十分钟，对方也可能暂时没空', { rows: 2 }),
    ]),
    flow('再想一个不同的做法', '不求完美，只要与上一个有所不同。寻求帮助、缩小范围也是做法。', [
      field('optionB', '做法 B', '比如：先用已有数据写简版，并说明缺失部分'),
      field('costB', 'B 的成本或限制', '比如：结论不完整，需要提前获得认可', { rows: 2 }),
    ]),
    flow('这次先尝试哪一个？', '依据目前的资源来选。做过之后可以再调整，不是永久决定。', [
      choice('selected', '我先尝试', [['a', '做法 A'], ['b', '做法 B']], { dynamic: 'plan' }),
    ]),
    flow('把行动落到时间与支持', '写一个认得出来的开始时机。无需他人支持时，也可以明确写“先独立做”。', [
      field('when', '什么时候开始？', '比如：今天下午两点，会议结束后', { rows: 2 }),
      field('support', '需要谁、什么支持？', '比如：请数据同事确认时间；或先独立整理清单', { rows: 2 }),
    ]),
  ],
  boundary: [
    flow('先看已有任务', '可以只写任务代称，不必输入同事姓名或公司机密。工作量本身就是需要讨论的信息。', [
      field('tasks', '目前已经承诺的任务', '比如：周五交月报，今天还要完成两份复核'),
    ]),
    flow('新增了什么，时间有多少？', '以实际可投入的时间为准，不把休息时间默认为可用工作时间。', [
      field('request', '新增的要求', '比如：今天下班前再做一版汇报材料'),
      field('capacity', '可投入的时间或精力', '比如：今天还有一小时，无法同时完成所有任务', { rows: 2 }),
    ]),
    flow('选一个想协商的方向', '先明确最需要改变的地方，稍后可以修改整段草稿。', [
      choice('strategy', '这次想讨论什么？', STRATEGIES),
    ]),
    flow('选择安全、合适的沟通方式', '如果有威胁、报复风险或欺凌，不需要把直接对抗当作必做任务。可以先向可信的人或可用的支持渠道了解选择。', [
      choice('safety', '哪一种方式更适合现在？', [
        ['direct', '我觉得可以尝试直接协商', '先写草稿，是否沟通仍由我决定。'],
        ['trusted', '先找可信支持，不直接协商', '和可信的人讨论如何保护自己、有哪些资源。'],
      ]),
    ]),
    flow('把草稿改成你自己的话', '这只是草稿，不会发送，也不会自动联系上司或任何人。可删改措辞与细节，再决定是否使用。', [
      field('draft', '可编辑的沟通草稿', '', { rows: 9, max: 7000 }),
    ], { draft: true }),
    flow('先决定下一小步', '可以先检查措辞、暂时休息，或私下寻找可信支持。完成练习不要求发出草稿。', nextFields()),
  ],
};
const EXAMPLES = {
  worry: {
    worry: '明天下午要做项目评审，我担心关键数据还没准备好。',
    route: 'act', action: '列出缺失的两项数据，向协作同事确认可提供的时间。',
    when: '今天下午两点，午间休息之后。',
    worryTime: '今天晚饭后，19:30 开始。', worryMinutes: '10',
    nextChoice: 'custom', nextCustom: '打开评审文档，先标出缺数据的两处。',
  },
  reframe: {
    situation: '评审时负责人指出两处问题，结束时说“明天再谈”。',
    thought: '他一定觉得我不胜任这项工作。', feeling: '担心，也有一点委屈。',
    for: '他确实指出了两处需要修改的内容。',
    against: '他没有评价我的整体能力。会议已经超时，其他议题也没谈完。',
    balanced: '这两处内容需要修改，但目前不知道他对整体的看法。我可以先修改并问清期待。',
    nextChoice: 'custom', nextCustom: '写下明天想确认的一个问题：这版最需要优先改哪里？',
  },
  plan: {
    problem: '周五交月报，还缺同事提供的一组数据。',
    optionA: '列出缺失数据清单，请同事确认提供时间。',
    costA: '需要十分钟整理，对方可能也在忙，要允许协商时间。',
    optionB: '先写已有数据的简版，向负责人说明缺失部分。',
    costB: '结论暂时不完整，需要负责人接受分阶段交付。',
    selected: 'a', when: '今天下午两点，先花十分钟整理清单。',
    support: '需要负责数据的同事确认可提供时间。',
  },
  boundary: {
    tasks: '周五交月报，今天完成两份复核。', request: '今天下班前补一版汇报材料。',
    capacity: '今天可投入约一小时，三项无法同时完成。',
    strategy: 'priority', safety: 'direct',
    nextChoice: 'custom', nextCustom: '先核对这三项任务的截止时间，再决定是否使用草稿。',
  },
};
const GROUND = [
  ['让视线落在身边', '睁着眼，看看一个身边的物体。留意它的颜色、轮廓或光影，停留多久由你决定。', '我留意到的东西（选填）', '比如：桌角的光，杯子的边缘'],
  ['留意身体得到的支撑', '感受脚下、椅背、坐垫或手臂下的支撑。选一个舒服的位置就好，不必改变姿势。', '我感受到的支撑（选填）', '比如：椅背托着我的后背'],
  ['听听此刻的环境', '留意此刻可听到的声音，近处或远处都可以。安静也算一种观察。听觉不方便时可以跳过。', '我听到或留意到的（选填）', '比如：空调的声音，或此刻比较安静'],
];
let instanceNumber = 0;
const clean = value => String(value ?? '').trim();
const escape = value => escapeHTML(String(value ?? ''));
const labelOf = (options, value) => options.find(option => option[0] === value)?.[1] || '';
const formatTime = ms => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * @param {'settle'|'ground'|'worry'|'reframe'|'plan'|'boundary'} id
 * @param {HTMLElement} container
 * @param {{onComplete?: Function, onExit?: Function, onHelp?: Function, onPracticeChange?: Function}} hooks
 * @returns {Function} Idempotent cleanup; call before replacing the host screen.
 * Internal ground/boundary switches return the active practice's id on completion.
 * Completion is emitted only after review confirmation; sample provenance is sticky.
 * onExit requests navigation; the host calls cleanup after confirming departure.
 * A songjian:pause event on container pauses breathing without automatic resume.
 */
export function mountPractice(id, container, { onComplete, onExit, onHelp, onPracticeChange } = {}) {
  if (!Object.hasOwn(TITLES, id)) throw new RangeError(`Unknown practice: ${id}`);
  if (!container || typeof container.replaceChildren !== 'function') throw new TypeError('A container element is required');
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const prefix = `cp-${++instanceNumber}`;
  const root = doc.createElement('section');
  root.className = 'cp-practice';
  root.setAttribute('aria-label', TITLES[id]);
  container.replaceChildren(root);
  const sessions = new Map();
  const history = [];
  let disposed = false;
  let finished = false;
  let raf = null;
  let startedAt = null;
  let timerOwner = null;
  let blurred = !doc.hasFocus();
  let helpOpen = false;
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');

  function session(practiceId, isExample = false) {
    const key = `${practiceId}:${isExample}`;
    if (!sessions.has(key)) sessions.set(key, {
      id: practiceId, isExample, view: 'intro', step: 0,
      data: isExample ? { ...EXAMPLES[practiceId] } : {},
      errors: {}, elapsed: 0, timerStatus: 'idle', timerNote: '',
      draftSource: '', generatedDraft: '', draftStale: false,
    });
    return sessions.get(key);
  }
  let current = session(id);

  function stopClock() {
    if (startedAt !== null && timerOwner) {
      timerOwner.elapsed = Math.min(120000, timerOwner.elapsed + Math.max(0, win.performance.now() - startedAt));
    }
    startedAt = null;
    timerOwner = null;
    if (raf !== null) win.cancelAnimationFrame(raf);
    raf = null;
  }
  function pauseClock(reason = '已暂停。准备好后，可自己选择继续。') {
    if (current.timerStatus !== 'running') return;
    stopClock();
    current.timerStatus = 'paused';
    current.timerNote = reason;
    if (!disposed) updateClock();
  }
  function cleanup() {
    if (disposed) return;
    stopClock();
    disposed = true;
    root.removeEventListener('click', handleClick);
    root.removeEventListener('input', handleInput);
    root.removeEventListener('change', handleInput);
    root.removeEventListener('submit', handleSubmit);
    container.removeEventListener('songjian:pause', onHostPause);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('blur', onBlur);
    win.removeEventListener('focus', onFocus);
    win.removeEventListener('pagehide', onPageHide);
    reducedMotion?.removeEventListener?.('change', onMotionChange);
    sessions.clear();
    history.length = 0;
    current = null;
    root.remove();
  }
  function onBlur() { blurred = true; pauseClock('窗口失去焦点，已暂停计时。回来后可手动继续。'); }
  function onFocus() { blurred = false; }
  function onVisibility() {
    if (doc.hidden) pauseClock('页面进入后台，已暂停计时。回来后可手动继续。');
  }
  function onPageHide() { pauseClock('页面已离开，计时暂停。'); }
  function onHostPause() { pauseClock('已暂停计时。关闭弹层后，准备好再按“继续”。'); }
  function onMotionChange() { if (!disposed && current.id === 'settle') updateClock(); }

  function button(action, text, kind = 'secondary', extra = '') {
    return `<button type="button" class="cp-button cp-button--${kind}" data-cp-action="${action}" ${extra}>${text}</button>`;
  }
  function fieldsFor(index = current.step) {
    const data = current.data;
    if (current.id === 'ground') {
      return index < 3 ? [field(`ground${index}`, GROUND[index][2], GROUND[index][3], { optional: true, rows: 2 })] : nextFields().filter(f => !f.when || f.when(data));
    }
    if (current.id === 'settle') return nextFields().filter(f => !f.when || f.when(data));
    let fields = FLOWS[current.id][index].fields;
    if (current.id === 'worry' && index === 2) {
      fields = data.route === 'act' ? [
        field('action', '我可以做的下一步', '写一个足够小、能够开始的动作'),
        field('when', '什么时候做？', '比如：今天下午两点，会议结束后', { rows: 2 }),
      ] : [
        field('worryTime', '留给担忧的时段，从什么时候开始？', '比如：今天晚饭后，19:30 开始', { rows: 2 }),
        choice('worryMinutes', '这次留多长时间？', [['10', '10 分钟'], ['15', '15 分钟']]),
      ];
    }
    if (current.id === 'boundary' && index === 4 && current.draftStale) {
      fields = [...fields, choice('draftChecked', '前面的信息改过了，请核对这段草稿', [
        ['checked', data.safety === 'trusted'
          ? '我已核对：这段只用于向可信的人寻求支持'
          : '我已核对：草稿符合当前任务、时间与沟通方式'],
      ])];
    }
    return fields.filter(f => !f.when || f.when(data));
  }
  function getOptions(f) {
    if (f.dynamic === 'plan') return [
      ['a', '做法 A', current.data.optionA],
      ['b', '做法 B', current.data.optionB],
    ];
    return f.options;
  }
  function fieldHTML(f) {
    const domId = `${prefix}-${f.key}`;
    const error = current.errors[f.key];
    const description = `${domId}-error${f.hint ? ` ${domId}-hint` : ''}`;
    const value = current.data[f.key] ?? '';
    const errorHTML = `<p class="cp-error" id="${domId}-error" ${error ? '' : 'hidden'}>${escape(error)}</p>`;
    if (f.type === 'choice') {
      return `<fieldset class="cp-field cp-choice-field" data-cp-field="${f.key}" aria-describedby="${description}" ${error ? 'aria-invalid="true"' : ''}>
        <legend class="cp-label">${escape(f.label)}<span class="cp-required">必选</span></legend>
        <div class="cp-options">${getOptions(f).map(([key, label, detail]) => `<label class="cp-option">
          <input class="cp-radio" type="radio" name="${domId}" value="${escape(key)}" data-cp-key="${f.key}" ${value === key ? 'checked' : ''} aria-describedby="${description}" ${error ? 'aria-invalid="true"' : ''}>
          <span class="cp-option-copy"><span class="cp-option-title">${escape(label)}</span>${detail ? `<span class="cp-option-detail">${escape(detail)}</span>` : ''}</span>
        </label>`).join('')}</div>${errorHTML}</fieldset>`;
    }
    return `<div class="cp-field" data-cp-field="${f.key}">
      <label class="cp-label" for="${domId}">${escape(f.label)}${f.optional ? '' : '<span class="cp-required">必填</span>'}</label>
      ${f.hint ? `<p class="cp-hint" id="${domId}-hint">${escape(f.hint)}</p>` : ''}
      <textarea class="cp-textarea" id="${domId}" data-cp-key="${f.key}" rows="${f.rows || 3}" maxlength="${f.max || 1200}" placeholder="${escape(f.placeholder)}" aria-describedby="${description}" ${f.optional ? '' : 'aria-required="true"'} ${error ? 'aria-invalid="true"' : ''}>${escape(value)}</textarea>
      ${errorHTML}</div>`;
  }
  function validate(fields = fieldsFor()) {
    const errors = {};
    for (const f of fields) {
      const value = clean(current.data[f.key]);
      if (!f.optional && !value) errors[f.key] = f.type === 'choice' ? '请选择一个适合此刻的选项。' : '请写一点具体内容，再继续。';
      else if (f.type === 'choice' && value && !getOptions(f).some(o => o[0] === value)) errors[f.key] = '请重新选择一个选项。';
      else if (f.type !== 'choice' && value.length > (f.max || 1200)) errors[f.key] = `请缩短到 ${f.max || 1200} 字以内。`;
    }
    current.errors = errors;
    return !Object.keys(errors).length;
  }
  function stepCount() { return current.id === 'ground' ? 4 : current.id === 'settle' ? 1 : FLOWS[current.id].length; }
  function nextAction() {
    if (current.id === 'plan') {
      return `${clean(current.data.when)} · ${clean(current.data[current.data.selected === 'a' ? 'optionA' : 'optionB'])}`;
    }
    return current.data.nextChoice === 'custom' ? clean(current.data.nextCustom) : labelOf(NEXT_OPTIONS, current.data.nextChoice);
  }
  function draftSource() {
    const d = current.data;
    return JSON.stringify([d.tasks, d.request, d.capacity, d.strategy, d.safety]);
  }
  function makeDraft() {
    const d = current.data;
    if (d.safety === 'trusted') {
      return `我想先和你私下讨论一件工作安排上的事。\n\n我目前在做：${clean(d.tasks)}\n新增要求是：${clean(d.request)}\n我实际能投入的时间是：${clean(d.capacity)}\n\n我希望争取的方向是“${labelOf(STRATEGIES, d.strategy)}”。我担心直接沟通可能带来风险，想先听听你的看法，了解有哪些安全的支持方式。请先不要替我转达或联系相关人员，我们能否先约一个合适的时间聊聊？`;
    }
    const request = {
      delay: '能否一起确认一个可行的新交付时间？我想先对齐最晚需要的时间，再明确能承诺的安排。',
      scope: '能否先确认这次必须交付的部分，并缩小本次范围？其余内容希望另行安排。',
      priority: '能否一起确认这些任务的优先级，以及哪项可以等待？确定取舍后，我再对齐相应的交付安排。',
      support: '能否讨论可以提供哪些人手、信息或时间支持？如果资源暂时无法补充，希望一起调整范围或期限。',
    }[d.strategy];
    return `想和你确认一下工作安排。\n\n目前已经在做：${clean(d.tasks)}\n这次新增的要求是：${clean(d.request)}\n我实际可投入的时间是：${clean(d.capacity)}\n\n${request}\n\n我希望把工作量、可用时间和交付预期先对齐，再确认下一步。`;
  }
  function prepareDraft() {
    if (current.id !== 'boundary' || current.step !== 4) return;
    const source = draftSource();
    // Refresh untouched generated text; retain a person's edits for explicit review.
    if (!current.draftSource || (current.draftSource !== source && current.data.draft === current.generatedDraft)) {
      current.data.draft = makeDraft();
      current.generatedDraft = current.data.draft;
      current.draftSource = source;
      current.data.draftChecked = '';
    }
    current.draftStale = current.draftSource !== source;
  }
  function summary() {
    const d = current.data;
    const row = (label, value) => ({ label, value: clean(value) });
    switch (current.id) {
      case 'settle': return [
        row('实际练习时间', `${formatTime(current.elapsed)}（只累计前台练习时间）`),
        row('结束方式', current.elapsed >= 120000 ? '两分钟已到，由你决定接下来做什么' : '提前结束，按自己的需要停下'),
      ];
      case 'ground': return GROUND.map((s, i) => row(['看见周围', '感受支撑', '听见环境'][i],
        d[`groundState${i}`] === 'skipped' ? '这一项暂时跳过' : clean(d[`ground${i}`]) || '已按自己的节奏留意'));
      case 'worry': return [
        row('这件担忧', d.worry), row('目前的分流', d.route === 'act' ? '有具体可处理的问题' : '暂不能行动，或是假设性担忧'),
        ...(d.route === 'act' ? [row('可做的下一步', d.action), row('行动时间', d.when)] : [
          row('留给担忧的时段', `${clean(d.worryTime)} · ${d.worryMinutes} 分钟`),
          row('时段说明', '这是自己记下的安排，不是自动提醒；担忧出现时不必压抑它。'),
        ]),
      ];
      case 'reframe': return [
        row('情境', d.situation), row('脑中的推测', d.thought), row('感受', d.feeling),
        row('支持推测的事实', d.for), row('不支持或保留其他可能的事实', d.against), row('更贴近事实的说法', d.balanced),
      ];
      case 'plan': return [
        row('具体问题', d.problem), row('做法 A', d.optionA), row('A 的成本或限制', d.costA),
        row('做法 B', d.optionB), row('B 的成本或限制', d.costB),
        row('这次选择', `做法 ${d.selected === 'a' ? 'A' : 'B'}：${clean(d[d.selected === 'a' ? 'optionA' : 'optionB'])}`),
        row('开始时间', d.when), row('需要的支持', d.support),
      ];
      case 'boundary': return [
        row('已有任务', d.tasks), row('新增要求', d.request), row('可投入时间', d.capacity),
        row('协商方向', labelOf(STRATEGIES, d.strategy)),
        row('沟通方式', d.safety === 'trusted' ? '先找可信支持，不直接协商' : '在觉得安全的前提下考虑协商'),
        row('未发送的沟通草稿', d.draft),
      ];
      default: return [];
    }
  }
  function progressHTML() {
    if (!['step', 'review'].includes(current.view)) return '';
    const count = stepCount() + 1;
    const index = current.view === 'review' ? count : current.step + 1;
    return `<div class="cp-progress"><div class="cp-progress-top"><span>${current.view === 'review' ? '最后 · 确认内容' : `第 ${index} 步 / ${count} 步`}</span><span>${current.isExample ? '职场例子体验' : '按自己的节奏'}</span></div>
      <div class="cp-progress-track" role="progressbar" aria-label="练习步骤" aria-valuemin="0" aria-valuemax="${count}" aria-valuenow="${index}"><span class="cp-progress-fill" style="width:${index / count * 100}%"></span></div></div>`;
  }
  function alternateHTML() {
    if (current.id === 'settle') return `<aside class="cp-alternative"><p>不想关注呼吸，也可以睁眼看看周围。</p>${button('switch-ground', '改做「回到当下」', 'quiet')}</aside>`;
    if (current.id === 'reframe') return `<aside class="cp-alternative"><p>如果面对的是持续超负荷、欺凌或不合理要求，事实不需要被“想开”。工作条件也需要改变。</p>${button('switch-boundary', '转到「工作边界与协商」', 'quiet')}</aside>`;
    return '';
  }
  function introHTML() {
    const meta = META[current.id];
    return `<div class="cp-intro-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="cp-eyebrow">${escape(meta[2])} · 随时可以停下</p>
      <h2 class="cp-heading" tabindex="-1">${escape(meta[0])}</h2>
      <p class="cp-lead">${escape(meta[1])}</p>
      <div class="cp-intro-actions">${button('start', current.id === 'settle' ? '进入呼吸练习' : '从这里开始', 'primary')}
      ${EXAMPLES[current.id] && !current.isExample ? button('example', '用一个职场例子体验') : ''}</div>
      <p class="cp-hint">不必写姓名或敏感信息。输入只在本次页面中临时保留；退出后清除。确认完成时，整理结果会交回本页。</p>`;
  }
  function clockHTML() {
    return `<h2 class="cp-heading cp-heading--center" tabindex="-1">保持你舒服的呼吸。</h2>
      <p class="cp-lead cp-center">不用深吸，不要憋气，也无需追赶圆环。</p>
      <div class="cp-breath-stage"><div class="cp-breath-halo" aria-hidden="true"></div><div class="cp-breath-ring" aria-hidden="true"></div>
        <div class="cp-breath-copy"><span class="cp-breath-label">按你的节奏</span><span class="cp-clock" role="timer" aria-live="off" aria-label="已练习时间">0:00</span><span class="cp-hint">共 2 分钟</span></div></div>
      <p class="cp-timer-note" role="status" aria-live="polite"></p>
      <div class="cp-timer-actions">${button('clock-toggle', '开始计时', 'primary')}
        ${button('clock-end', '提前结束', 'secondary', 'disabled')}</div>
      <p class="cp-hint cp-center">切到后台或窗口失焦会自动暂停，回来后由你手动继续。不测量心率或任何身体指标。</p>
      <div class="cp-note"><strong>不舒服时就停下。</strong>可以立即退出，或转去看周围。不需要坚持到计时结束。</div>`;
  }
  function stepHTML() {
    prepareDraft();
    let title, description;
    if (current.id === 'ground') {
      [title, description] = current.step < 3 ? GROUND[current.step] : ['选一个想回去做的小动作', '念头仍在也没关系。选一个眼前能开始的小动作，或先休息。'];
    } else if (current.id === 'settle') {
      title = '停在这里，再选一个小行动。';
      description = `这次实际练习了 ${formatTime(current.elapsed)}。不需要评价自己是否“做好”，也不必要求感受发生变化。`;
    } else {
      ({ title, description } = FLOWS[current.id][current.step]);
      if (current.id === 'worry' && current.step === 2) {
        title = current.data.route === 'act' ? '安排一个可执行的下一步' : '留一个 10–15 分钟的担忧时段';
        description = current.data.route === 'act'
          ? '把“解决它”缩小为一个动作，并写下准备开始的时机。'
          : '用自己的话写一个时段。这不是自动提醒，不会设置通知。到时可以写写担忧、看看有没有新动作；现在无需把念头赶走。';
      }
    }
    const groundStep = current.id === 'ground' && current.step < 3;
    const draftStep = current.id === 'boundary' && current.step === 4;
    return `<h2 class="cp-heading" tabindex="-1">${escape(title)}</h2><p class="cp-lead">${escape(description)}</p>
      ${groundStep ? `<div class="cp-ground-cue" aria-hidden="true"><span class="cp-ground-number">0${current.step + 1}</span><span>${['看一看', '感受支撑', '听一听'][current.step]}</span></div><p class="cp-hint">不用达到某种状态。注意力走开后，也可以再回来。</p>` : ''}
      ${draftStep && current.draftStale ? `<div class="cp-note cp-note--purple" role="status">前面的安排或沟通方式改过了，你已编辑的草稿仍保留。请核对它是否适合现在的情况。
        <div class="cp-inline-actions">${button('refresh-draft', '用当前信息重写草稿（替换此段）', 'quiet')}</div></div>` : ''}
      <form class="cp-form" novalidate>${fieldsFor().map(fieldHTML).join('')}
        ${draftStep ? '<p class="cp-hint">草稿未发送。你可以先保留想法，不必联系任何人。</p>' : ''}
        <div class="cp-step-actions">${button('back', current.step === 0 ? (current.id === 'settle' ? '返回呼吸' : '返回介绍') : '上一步', 'quiet')}
          <button type="submit" class="cp-button cp-button--primary">${groundStep ? '我留意过了，继续' : current.step === stepCount() - 1 ? '查看并确认' : '下一步'}</button></div>
        ${groundStep ? `<div class="cp-skip">${button('skip-ground', '此刻不方便，跳过这一项', 'quiet')}</div>` : ''}
      </form>`;
  }
  function reviewHTML() {
    return `<p class="cp-eyebrow">${current.isExample ? '示例行动卡 · 不代表你的个人记录' : '我的行动卡 · 确认后完成'}</p>
      <h2 class="cp-heading" tabindex="-1">看看，这是否符合你的意思。</h2>
      <p class="cp-lead">可以返回修改。确认仅表示完成这次整理，不代表情绪或身体状况已经改变。</p>
      <dl class="cp-summary">${summary().map(row => `<div class="cp-summary-row"><dt>${escape(row.label)}</dt><dd>${escape(row.value)}</dd></div>`).join('')}
        <div class="cp-summary-row cp-summary-row--next"><dt>接下来的小行动</dt><dd>${escape(nextAction())}</dd></div></dl>
      ${current.id === 'boundary' ? '<p class="cp-note">这是一份未发送的草稿。是否使用、何时沟通，都由你决定。</p>' : ''}
      <div class="cp-step-actions">${button('review-back', '返回修改', 'quiet')}${button('complete', current.isExample ? '确认完成示例体验' : '确认完成这次练习', 'primary')}</div>`;
  }
  function render(focus = true) {
    if (disposed) return;
    root.setAttribute('aria-label', TITLES[current.id]);
    root.innerHTML = `<header class="cp-header"><div class="cp-title-group"><span class="cp-kicker">给此刻一点空间</span><p class="cp-practice-title">${escape(TITLES[current.id])}</p></div>
      <div class="cp-header-actions">${button('help', '需要支持', 'quiet')}${button('exit', '退出练习', 'quiet')}</div></header>
      ${history.length ? `<div class="cp-return">${button('return-practice', `返回「${escape(TITLES[history.at(-1).id])}」的进度`, 'quiet')}</div>` : ''}
      ${current.isExample ? '<div class="cp-example-banner">正在体验职场例子。即使修改文字，完成结果仍标记为示例。</div>' : ''}
      ${helpOpen ? '<aside class="cp-note" role="status">可以先停下，找一位可信的人聊聊。如果困扰持续影响生活，可以考虑寻求合适的专业支持；工作中的负担也需要资源与条件的改变。</aside>' : ''}
      <div class="cp-content">${progressHTML()}${current.view === 'intro' ? introHTML() : current.view === 'clock' ? clockHTML() : current.view === 'review' ? reviewHTML() : stepHTML()}</div>
      ${alternateHTML()}
      <footer class="cp-footer">这是一次简短的自助练习，不用于诊断，也不等同于完整的 CBT 自助或治疗。</footer>`;
    if (current.view === 'clock') updateClock();
    if (focus) root.querySelector('.cp-heading')?.focus({ preventScroll: false });
  }
  function renderErrors() {
    render(false);
    const key = Object.keys(current.errors)[0];
    const invalid = root.querySelector(`[data-cp-key="${key}"]`);
    invalid?.focus();
  }
  function updateClock() {
    if (disposed || current.id !== 'settle' || current.view !== 'clock') return;
    const elapsed = Math.min(120000, current.elapsed + (startedAt === null ? 0 : Math.max(0, win.performance.now() - startedAt)));
    const clock = root.querySelector('.cp-clock');
    if (!clock) return;
    const text = formatTime(elapsed);
    if (clock.textContent !== text) clock.textContent = text;
    clock.setAttribute('aria-label', `已练习 ${text}，共两分钟`);
    const ring = root.querySelector('.cp-breath-ring');
    const scale = reducedMotion?.matches ? 1 : 0.94 + 0.06 * (1 - Math.cos(elapsed / 8000 * Math.PI * 2));
    ring.style.transform = `scale(${scale})`;
    const note = root.querySelector('.cp-timer-note');
    const noteText = current.timerStatus === 'running'
      ? '正在计时。圆环只供参考，按自己舒服的节奏呼吸。'
      : current.timerNote || '准备好再开始。两分钟只是一个可随时结束的邀请。';
    if (note.textContent !== noteText) note.textContent = noteText;
    const toggle = root.querySelector('[data-cp-action="clock-toggle"]');
    toggle.textContent = current.timerStatus === 'running' ? '暂停' : current.timerStatus === 'paused' ? '继续' : '开始计时';
    root.querySelector('[data-cp-action="clock-end"]').disabled = elapsed <= 0;
  }
  function tick() {
    raf = null;
    if (disposed || current.timerStatus !== 'running') return;
    if (doc.hidden || blurred) { pauseClock('页面不在前台，已暂停计时。回来后可手动继续。'); return; }
    const elapsed = current.elapsed + Math.max(0, win.performance.now() - startedAt);
    if (elapsed >= 120000) { endClock(); return; }
    updateClock();
    raf = win.requestAnimationFrame(tick);
  }
  function startClock() {
    if (doc.hidden || blurred) {
      current.timerNote = '请回到当前窗口后，再选择开始或继续。';
      updateClock();
      return;
    }
    if (current.elapsed >= 120000) { current.view = 'step'; render(); return; }
    current.timerStatus = 'running';
    current.timerNote = '';
    timerOwner = current;
    startedAt = win.performance.now();
    updateClock();
    raf = win.requestAnimationFrame(tick);
  }
  function endClock() {
    stopClock();
    if (current.elapsed <= 0) return;
    current.timerStatus = 'paused';
    current.timerNote = '已结束本段呼吸；如果需要，也可以继续剩余时间。';
    current.view = 'step';
    current.step = 0;
    render();
  }
  function goNext(skipGround = false) {
    if (current.view !== 'step') return;
    if (!validate()) { renderErrors(); return; }
    if (current.id === 'boundary' && current.step === 4 && current.draftStale) {
      current.draftSource = draftSource();
      current.draftStale = false;
    }
    if (current.id === 'ground' && current.step < 3) current.data[`groundState${current.step}`] = skipGround ? 'skipped' : 'noticed';
    current.errors = {};
    if (current.step < stepCount() - 1) current.step += 1;
    else current.view = 'review';
    render();
  }
  function switchPractice(nextId) {
    pauseClock('切换了练习，呼吸计时已暂停。返回后可手动继续。');
    history.push(current);
    current = session(nextId, current.isExample);
    helpOpen = false;
    onPracticeChange?.(current.id);
    render();
  }
  function handleInput(event) {
    if (disposed || finished) return;
    const input = event.target;
    const key = input.dataset?.cpKey;
    if (!key || !root.contains(input)) return;
    if (input.type === 'radio' && !input.checked) return;
    current.data[key] = input.value;
    if (current.id === 'boundary' && (['tasks', 'request', 'capacity', 'strategy', 'safety'].includes(key) || (key === 'draft' && current.draftStale))) {
      current.data.draftChecked = '';
      root.querySelectorAll('[data-cp-key="draftChecked"]').forEach(node => { node.checked = false; });
    }
    if (current.errors[key]) {
      delete current.errors[key];
      const wrapper = input.closest('[data-cp-field]');
      wrapper?.removeAttribute('aria-invalid');
      wrapper?.querySelectorAll('[aria-invalid]').forEach(node => node.removeAttribute('aria-invalid'));
      const error = wrapper?.querySelector('.cp-error');
      if (error) { error.textContent = ''; error.hidden = true; }
    }
    // Only a choice can change the visible fields; typing never replaces a textarea.
    if (input.type === 'radio' && event.type === 'change') {
      const value = input.value;
      render(false);
      root.querySelector(`[data-cp-key="${key}"][value="${value}"]`)?.focus({ preventScroll: true });
    }
  }
  function handleSubmit(event) {
    event.preventDefault();
    if (!disposed && !finished) goNext();
  }
  function complete() {
    if (current.view !== 'review' || finished) return;
    // Recheck all active branch fields before handing any content to the host.
    for (let i = 0; i < stepCount(); i += 1) {
      if (!validate(fieldsFor(i))) { current.step = i; current.view = 'step'; renderErrors(); return; }
    }
    if (current.id === 'settle' && current.elapsed <= 0) { current.view = 'clock'; render(); return; }
    if (current.id === 'ground') {
      const missing = [0, 1, 2].find(i => !current.data[`groundState${i}`]);
      if (missing !== undefined) { current.step = missing; current.view = 'step'; render(); return; }
    }
    const payload = { id: current.id, title: TITLES[current.id], summary: summary(), nextAction: nextAction(), isExample: current.isExample };
    finished = true;
    cleanup();
    onComplete?.(payload);
  }
  function handleClick(event) {
    if (disposed || finished) return;
    const target = event.target.closest?.('[data-cp-action]');
    if (!target || !root.contains(target) || target.disabled) return;
    switch (target.dataset.cpAction) {
      case 'exit':
        pauseClock('已暂停。若选择留在这里，准备好后再按“继续”。');
        if (typeof onExit === 'function') onExit();
        else cleanup();
        break;
      case 'help':
        pauseClock('已暂停，你可以先看看支持方式。');
        if (typeof onHelp === 'function') onHelp();
        else { helpOpen = !helpOpen; render(false); }
        break;
      case 'start':
        current.view = current.id === 'settle' ? 'clock' : 'step';
        current.step = 0; render(); break;
      case 'example':
        history.push(current); current = session(current.id, true); current.view = 'step'; render(); break;
      case 'return-practice':
        if (history.length) { pauseClock(); current = history.pop(); onPracticeChange?.(current.id); render(); }
        break;
      case 'back':
        current.errors = {};
        if (current.step > 0) current.step -= 1;
        else current.view = current.id === 'settle' ? 'clock' : 'intro';
        render(); break;
      case 'review-back': current.step = stepCount() - 1; current.view = 'step'; render(); break;
      case 'complete': complete(); break;
      case 'skip-ground': goNext(true); break;
      case 'clock-toggle': current.timerStatus === 'running' ? pauseClock() : startClock(); break;
      case 'clock-end': endClock(); break;
      case 'switch-ground': switchPractice('ground'); break;
      case 'switch-boundary': switchPractice('boundary'); break;
      case 'refresh-draft':
        current.data.draft = makeDraft(); current.generatedDraft = current.data.draft;
        current.draftSource = draftSource(); current.draftStale = false;
        current.data.draftChecked = ''; delete current.errors.draftChecked; render(); break;
      default: break;
    }
  }
  root.addEventListener('click', handleClick);
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleInput);
  root.addEventListener('submit', handleSubmit);
  container.addEventListener('songjian:pause', onHostPause);
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);
  win.addEventListener('pagehide', onPageHide);
  reducedMotion?.addEventListener?.('change', onMotionChange);
  render();
  return cleanup;
}
