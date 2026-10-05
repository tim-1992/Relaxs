(() => {
  // dist/src/ui.js
  var paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    leaf: '<path d="M20 4C10 2 3 8 5 15s15 9 15-11ZM5 21 16 10"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    spark: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/>',
    heart: '<path d="M20 5a5.5 5.5 0 0 0-8 1 5.5 5.5 0 0 0-8-1c-5 5 2 12 8 16 6-4 13-11 8-16Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
    box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M8 5l9 5"/>',
    wind: '<path d="M3 8h13a3 3 0 1 0-3-3M3 12h17a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',
    cloud: '<path d="M7 18a5 5 0 1 1 0-10 7 7 0 0 1 13 3 3.5 3.5 0 0 1-1 7Z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    steps: '<path d="M3 21v-6h6V9h6V3h6M3 21h18"/>',
    message: '<path d="M21 11a9 9 0 0 1-9 9 12 12 0 0 1-4-1l-5 2 1-5a9 9 0 1 1 17-5Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    flower: '<path d="M12 9C1-2 0 13 9 12 0 23 15 24 12 15c11 11 12-4 3-3 9-11-6-12-3-3Z"/><circle cx="12" cy="12" r="2"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 5q10 7 0 14M18 5q-10 7 0 14"/>',
    focus: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 9v1m8-1v1m-9 4q5 6 10 0"/>'
  };
  var icon = (name, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
  var escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  // dist/src/care-data.js
  var sources = {
    nice: { name: "NICE \xB7 \u6210\u4EBA\u5E7F\u6CDB\u6027\u7126\u8651\u4E0E\u60CA\u6050\u969C\u788D\u6307\u5357", url: "https://www.nice.org.uk/guidance/cg113/chapter/Recommendations" },
    breath: { name: "NHS \xB7 \u538B\u529B\u4E0B\u7684\u8212\u9002\u547C\u5438\u7EC3\u4E60", url: "https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/" },
    whoSkills: { name: "WHO \xB7 Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927" },
    worry: { name: "NHS \xB7 Tackling your worries", url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/tackling-your-worries/" },
    thought: { name: "NHS \xB7 Thought record", url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/thought-record/" },
    problem: { name: "NHS \xB7 Problem-solving", url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/problem-solving/" },
    work: { name: "WHO \xB7 Mental health at work", url: "https://www.who.int/news-room/fact-sheets/detail/mental-health-at-work" },
    sleep: { name: "NHS \xB7 \u7761\u7720\u4E0E\u5FC3\u7406\u5065\u5EB7", url: "https://www.nhs.uk/every-mind-matters/mental-health-issues/sleep/" },
    move: { name: "WHO \xB7 \u8EAB\u4F53\u6D3B\u52A8", url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity" }
  };
  var methods = [
    {
      id: "settle",
      title: "\u5148\u8BA9\u547C\u5438\u8212\u670D\u4E00\u70B9",
      short: "\u8212\u9002\u547C\u5438",
      group: "body",
      label: "\u8EAB\u4F53\u5B89\u987F",
      time: "\u7EA6 2 \u5206\u949F",
      icon: "wind",
      color: "sage",
      intro: "\u8DDF\u7740\u4E00\u4E2A\u6E29\u548C\u7684\u8282\u594F\uFF0C\u6216\u7167\u81EA\u5DF1\u7684\u547C\u5438\u6765\u3002",
      output: "\u5E26\u8D70\u4E00\u4E2A\u56DE\u5230\u5F53\u4E0B\u7684\u5C0F\u52A8\u4F5C",
      fit: "\u8EAB\u4F53\u7D27\u7EF7\uFF0C\u60F3\u5148\u505C\u4E00\u5C0F\u4F1A\u513F\u3002",
      limit: "\u8282\u594F\u4E0D\u662F\u8981\u6C42\u3002\u4E0D\u5FC5\u6DF1\u5438\u6216\u618B\u6C14\uFF1B\u5934\u6655\u3001\u618B\u95F7\u6216\u66F4\u7126\u8651\u5C31\u505C\u6B62\uFF0C\u4E5F\u53EF\u4EE5\u6362\u6210\u89C2\u5BDF\u5468\u56F4\u3002",
      evidence: "\u501F\u9274 NHS \u8212\u9002\u547C\u5438\u6307\u5BFC\uFF0C\u7528\u4E8E\u5F53\u4E0B\u7684\u81EA\u6211\u8C03\u8282\u3002\u672C\u9875\u9762\u7684\u77ED\u7EC3\u4E60\u672A\u5355\u72EC\u9A8C\u8BC1\u7597\u6548\uFF0C\u4E0D\u66FF\u4EE3\u7126\u8651\u6CBB\u7597\u3002",
      sources: ["breath"]
    },
    {
      id: "ground",
      title: "\u628A\u6CE8\u610F\u529B\u5E26\u56DE\u8FD9\u91CC",
      short: "\u56DE\u5230\u5F53\u4E0B",
      group: "body",
      label: "\u5F53\u4E0B\u89C9\u5BDF",
      time: "\u6309\u81EA\u5DF1\u7684\u8282\u594F",
      icon: "eye",
      color: "blue",
      intro: "\u770B\u770B\u8EAB\u8FB9\uFF0C\u611F\u53D7\u652F\u6491\uFF0C\u9009\u4E00\u4EF6\u773C\u524D\u7684\u5C0F\u4E8B\u3002",
      output: "\u5E26\u8D70\u4E00\u4E2A\u613F\u610F\u7EE7\u7EED\u7684\u884C\u52A8",
      fit: "\u5FF5\u5934\u5F88\u5435\uFF0C\u60F3\u6682\u65F6\u628A\u6CE8\u610F\u529B\u653E\u56DE\u8EAB\u8FB9\u3002",
      limit: "\u53EF\u4EE5\u7741\u773C\u3001\u4E0D\u5FC5\u6E05\u7A7A\u5FF5\u5934\u3002\u8EAB\u4F53\u89C9\u5BDF\u4E0D\u8212\u670D\u65F6\uFF0C\u6539\u4E3A\u770B\u4E00\u4E2A\u5916\u90E8\u7269\u4F53\uFF0C\u6216\u505C\u4E0B\u3002",
      evidence: "\u501F\u9274 WHO \u538B\u529B\u5E94\u5BF9\u6307\u5357\u4E2D\u7684 grounding \u6280\u80FD\u3002\u662F\u5E94\u5BF9\u538B\u529B\u7684\u6280\u80FD\u7EC3\u4E60\uFF0C\u4E0D\u662F\u5BF9\u521B\u4F24\u6216\u7126\u8651\u969C\u788D\u7684\u5355\u72EC\u6CBB\u7597\u3002",
      sources: ["whoSkills"]
    },
    {
      id: "worry",
      title: "\u7ED9\u62C5\u5FE7\u5206\u4E00\u6761\u8DEF",
      short: "\u62C5\u5FE7\u5206\u6D41",
      group: "mind",
      label: "\u62C5\u5FE7\u7BA1\u7406",
      time: "\u7EA6 3\u20135 \u5206\u949F",
      icon: "cloud",
      color: "violet",
      intro: "\u8FD9\u4EF6\u4E8B\u73B0\u5728\u80FD\u5904\u7406\uFF0C\u8FD8\u662F\u8111\u4E2D\u5728\u9884\u6F14\u201C\u4E07\u4E00\u201D\uFF1F",
      output: "\u5E26\u8D70\u4E00\u4E2A\u884C\u52A8\u6216\u62C5\u5FE7\u65F6\u6BB5\u5B89\u6392",
      fit: "\u8111\u5B50\u53CD\u590D\u60F3\u540C\u4E00\u4EF6\u4E8B\uFF0C\u4E00\u65F6\u505C\u4E0D\u4E0B\u6765\u3002",
      limit: "\u5EF6\u540E\u5904\u7406\u4E0D\u662F\u538B\u4F4F\u5FF5\u5934\uFF0C\u4E5F\u4E0D\u9002\u7528\u4E8E\u5E94\u8BE5\u9A6C\u4E0A\u5904\u7406\u7684\u771F\u5B9E\u5371\u9669\u3002\u62C5\u5FE7\u65F6\u6BB5\u53EA\u662F\u81EA\u5DF1\u5B89\u6392\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u63D0\u9192\u3002",
      evidence: "\u501F\u9274 NHS \u7684\u62C5\u5FE7\u6811\u4E0E\u62C5\u5FE7\u65F6\u6BB5\u65B9\u6CD5\u3002\u5B8C\u6574 CBT \u81EA\u52A9\u9700\u8981\u8FDE\u7EED\u7EC3\u4E60\uFF1B\u4E00\u6B21\u5206\u6D41\u4E0D\u7B49\u4E8E\u5B8C\u6210\u6CBB\u7597\u3002",
      sources: ["worry", "nice"]
    },
    {
      id: "reframe",
      title: "\u5206\u6E05\u4E8B\u5B9E\u548C\u63A8\u6D4B",
      short: "\u8BA4\u77E5\u68B3\u7406",
      group: "mind",
      label: "\u8BA4\u77E5\u884C\u4E3A\u65B9\u6CD5",
      time: "\u7EA6 5\u20138 \u5206\u949F",
      icon: "grid",
      color: "peach",
      intro: "\u4E0D\u6025\u7740\u8BF4\u670D\u81EA\u5DF1\u4E50\u89C2\uFF0C\u5148\u770B\u770B\u6709\u4EC0\u4E48\u8BC1\u636E\u3002",
      output: "\u5E26\u8D70\u4E00\u53E5\u66F4\u8D34\u8FD1\u4E8B\u5B9E\u7684\u7406\u89E3",
      fit: "\u4E00\u6B21\u53CD\u9988\u3001\u4E00\u4E2A\u6D88\u606F\uFF0C\u8BA9\u4F60\u60F3\u5230\u4E86\u6700\u574F\u7684\u7ED3\u5C40\u3002",
      limit: "\u771F\u5B9E\u8D85\u8D1F\u8377\u3001\u6B67\u89C6\u6216\u6B3A\u51CC\u9700\u8981\u73B0\u5B9E\u652F\u6301\uFF0C\u4E0D\u80FD\u9760\u6539\u53D8\u60F3\u6CD5\u6765\u5408\u7406\u5316\u3002",
      evidence: "\u501F\u9274 NHS \u7684 CBT \u60F3\u6CD5\u8BB0\u5F55\u3002CBT \u6709\u6307\u5357\u652F\u6301\uFF1B\u6B64\u4EA4\u4E92\u53EA\u662F\u5176\u4E2D\u4E00\u4E2A\u6280\u80FD\uFF0C\u4E0D\u662F\u5B8C\u6574 CBT \u7597\u7A0B\u3002",
      sources: ["thought", "nice"]
    },
    {
      id: "plan",
      title: "\u628A\u4E00\u4EF6\u96BE\u4E8B\u62C6\u5C0F",
      short: "\u95EE\u9898\u89E3\u51B3",
      group: "work",
      label: "\u73B0\u5B9E\u95EE\u9898",
      time: "\u7EA6 4\u20136 \u5206\u949F",
      icon: "steps",
      color: "sage",
      intro: "\u6446\u51FA\u4E24\u4E2A\u53EF\u884C\u505A\u6CD5\uFF0C\u9009\u4E00\u4E2A\u6B64\u523B\u80FD\u8FC8\u51FA\u7684\u6B65\u9AA4\u3002",
      output: "\u5E26\u8D70\u4E00\u5F20\u5177\u4F53\u7684\u4E0B\u4E00\u6B65\u884C\u52A8\u5361",
      fit: "\u6709\u660E\u786E\u7684\u95EE\u9898\uFF0C\u5374\u88AB\u4E8B\u60C5\u7684\u4F53\u91CF\u5361\u4F4F\u4E86\u3002",
      limit: "\u53EA\u5904\u7406\u4F60\u80FD\u591F\u5F71\u54CD\u7684\u90E8\u5206\u3002\u8D44\u6E90\u4E0D\u8DB3\u65F6\uFF0C\u5BFB\u6C42\u652F\u6301\u672C\u8EAB\u4E5F\u662F\u4E00\u4E2A\u53EF\u884C\u6B65\u9AA4\u3002",
      evidence: "\u501F\u9274 NHS \u7684\u7ED3\u6784\u5316\u95EE\u9898\u89E3\u51B3\u65B9\u6CD5\uFF0C\u5E2E\u52A9\u628A\u95EE\u9898\u8F6C\u6210\u53EF\u6267\u884C\u8BA1\u5212\u3002\u505A\u4E86\u8BA1\u5212\u4E0D\u4EE3\u8868\u538B\u529B\u6765\u6E90\u5DF2\u7ECF\u89E3\u51B3\u3002",
      sources: ["problem"]
    },
    {
      id: "boundary",
      title: "\u8BA9\u5DE5\u4F5C\u8FB9\u754C\u8BF4\u5F97\u6E05",
      short: "\u8FB9\u754C\u534F\u5546",
      group: "work",
      label: "\u5DE5\u4F5C\u91CF\u4E0E\u652F\u6301",
      time: "\u7EA6 4\u20136 \u5206\u949F",
      icon: "message",
      color: "blue",
      intro: "\u628A\u4EFB\u52A1\u3001\u65F6\u95F4\u548C\u53D6\u820D\u8BF4\u6E05\u695A\uFF0C\u7559\u4E0B\u4E00\u4EFD\u6C9F\u901A\u8349\u7A3F\u3002",
      output: "\u5E26\u8D70\u4E00\u6BB5\u53EF\u4EE5\u81EA\u884C\u4FEE\u6539\u7684\u8868\u8FBE",
      fit: "\u4EFB\u52A1\u4E0D\u65AD\u52A0\u8FDB\u6765\uFF0C\u9700\u8981\u786E\u8BA4\u4F18\u5148\u7EA7\u6216\u4E89\u53D6\u652F\u6301\u3002",
      limit: "\u8349\u7A3F\u4E0D\u4F1A\u81EA\u52A8\u53D1\u9001\u3002\u5982\u679C\u76F4\u63A5\u6C9F\u901A\u4E0D\u5B89\u5168\uFF0C\u53EF\u4EE5\u5148\u627E\u53EF\u4FE1\u7684\u4EBA\u3001\u5408\u9002\u7684\u5458\u5DE5\u652F\u6301\u6E20\u9053\u6216\u4E13\u4E1A\u652F\u6301\u3002",
      evidence: "WHO \u5F3A\u8C03\u5DE5\u4F5C\u6761\u4EF6\u3001\u5DE5\u4F5C\u91CF\u548C\u652F\u6301\u7684\u91CD\u8981\u6027\u3002\u6B64\u6C9F\u901A\u5DE5\u5177\u662F\u4EA7\u54C1\u8BBE\u8BA1\uFF0C\u5C1A\u65E0\u672C\u5DE5\u5177\u72EC\u7ACB\u6709\u6548\u6027\u7684\u8BC1\u636E\u3002",
      sources: ["work"]
    }
  ];
  var methodById = (id) => methods.find((method) => method.id === id);

  // dist/src/care-state.js
  function makeCareRecord(payload, now = Date.now()) {
    const method = methodById(payload?.id);
    if (!method || !Array.isArray(payload.summary) || !payload.summary.length || typeof payload.nextAction !== "string" || !payload.nextAction.trim()) return null;
    const summary = payload.summary.filter((item) => item && typeof item.label === "string" && typeof item.value === "string" && item.value.trim()).map((item) => ({ label: item.label, value: item.value }));
    if (!summary.length) return null;
    return {
      id: method.id,
      title: method.short,
      summary,
      nextAction: payload.nextAction.trim(),
      isExample: payload.isExample === true,
      createdAt: now,
      feedback: null
    };
  }
  var personalRecords = (records) => records.filter((record) => record && !record.isExample);
  function feedbackFor(choice2) {
    return {
      better: { title: "\u8BB0\u4F4F\u8FD9\u4E00\u523B\u5BF9\u4F60\u6709\u7528\u7684\u90E8\u5206\u3002", text: "\u8FD9\u662F\u4F60\u6B64\u523B\u7684\u611F\u53D7\uFF0C\u4E0D\u4EE3\u8868\u7126\u8651\u5DF2\u88AB\u6CBB\u7597\u3002\u770B\u770B\u63A5\u4E0B\u6765\u90A3\u4E00\u6B65\u662F\u5426\u9002\u5408\u73B0\u5728\u53BB\u505A\u3002", offerSupport: false },
      same: { title: "\u6CA1\u6709\u660E\u663E\u53D8\u5316\uFF0C\u4E5F\u53EF\u4EE5\u5982\u5B9E\u7559\u4E0B\u3002", text: "\u6CA1\u6709\u660E\u663E\u53D8\u5316\u4E0D\u4EE3\u8868\u4F60\u505A\u9519\u4E86\u3002\u53EF\u4EE5\u6362\u4E00\u79CD\u65B9\u5F0F\uFF0C\u4E5F\u53EF\u4EE5\u4F11\u606F\u6216\u5BFB\u6C42\u652F\u6301\u3002", offerSupport: false },
      worse: { title: "\u5148\u505C\u4E0B\uFF0C\u4E0D\u9700\u8981\u575A\u6301\u5B8C\u6210\u66F4\u591A\u3002", text: "\u5982\u679C\u8FD9\u4E2A\u7EC3\u4E60\u8BA9\u4F60\u66F4\u96BE\u53D7\uFF0C\u8BF7\u505C\u6B62\uFF0C\u56DE\u5230\u8212\u670D\u7684\u73AF\u5883\uFF0C\u5FC5\u8981\u65F6\u8054\u7CFB\u53EF\u4FE1\u7684\u4EBA\u6216\u4E13\u4E1A\u652F\u6301\u3002", offerSupport: true },
      unsure: { title: "\u6682\u65F6\u8BF4\u4E0D\u4E0A\u6765\uFF0C\u4E5F\u6CA1\u5173\u7CFB\u3002", text: "\u4E0D\u5FC5\u9A6C\u4E0A\u5224\u65AD\u6548\u679C\u3002\u4F60\u4ECD\u53EF\u4EE5\u51B3\u5B9A\u4E0B\u4E00\u6B65\u505A\u4EC0\u4E48\uFF0C\u6216\u8005\u4ECA\u5929\u5148\u5230\u8FD9\u91CC\u3002", offerSupport: false }
    }[choice2] || null;
  }

  // dist/src/care-practices.js
  var TITLES = {
    settle: "\u8212\u9002\u547C\u5438",
    ground: "\u56DE\u5230\u5F53\u4E0B",
    worry: "\u62C5\u5FE7\u5206\u6D41",
    reframe: "\u4E8B\u5B9E\u4E0E\u63A8\u6D4B",
    plan: "\u89E3\u51B3\u4E00\u4EF6\u5177\u4F53\u4E8B",
    boundary: "\u5DE5\u4F5C\u8FB9\u754C\u4E0E\u534F\u5546"
  };
  var META = {
    settle: ["\u7ED9\u81EA\u5DF1\u4E24\u5206\u949F\uFF0C\u547C\u5438\u4E0D\u7528\u8868\u73B0\u5F97\u66F4\u597D\u3002", "\u4FDD\u6301\u5E73\u5E38\u3001\u8212\u670D\u7684\u547C\u5438\u3002\u5706\u73AF\u53EA\u662F\u8282\u594F\u53C2\u8003\uFF0C\u4E0D\u5FC5\u8DDF\u4E0A\uFF0C\u4E0D\u618B\u6C14\uFF0C\u4E5F\u4E0D\u7528\u523B\u610F\u6DF1\u5438\u3002\u51FA\u73B0\u5934\u6655\u3001\u6C14\u77ED\u6216\u5176\u4ED6\u4E0D\u9002\u5C31\u505C\u4E0B\uFF0C\u6539\u4E3A\u770B\u770B\u5468\u56F4\u6216\u9000\u51FA\u3002", "\u7EA6 2 \u5206\u949F"],
    ground: ["\u628A\u4E00\u5C0F\u90E8\u5206\u6CE8\u610F\u529B\uFF0C\u653E\u56DE\u6B64\u523B\u3002", "\u7741\u7740\u773C\uFF0C\u4F9D\u6B21\u7559\u610F\u5468\u56F4\u3001\u8EAB\u4F53\u7684\u652F\u6491\u548C\u73AF\u5883\u58F0\u97F3\u3002\u4E0D\u7528\u51D1\u591F\u6570\u91CF\uFF0C\u4E5F\u4E0D\u9700\u8981\u6E05\u7A7A\u5FF5\u5934\uFF1B\u4E0D\u65B9\u4FBF\u7684\u611F\u5B98\u6B65\u9AA4\u53EF\u4EE5\u8DF3\u8FC7\u3002", "\u6309\u81EA\u5DF1\u7684\u8282\u594F"],
    worry: ["\u5148\u770B\u8FD9\u4EF6\u62C5\u5FE7\uFF0C\u73B0\u5728\u80FD\u505A\u4E9B\u4EC0\u4E48\u3002", "\u628A\u4E00\u4EF6\u62C5\u5FE7\u5199\u4E0B\u6765\uFF0C\u518D\u51B3\u5B9A\u662F\u5B89\u6392\u884C\u52A8\uFF0C\u8FD8\u662F\u7559\u4E00\u4E2A\u77ED\u65F6\u6BB5\u6162\u6162\u60F3\u3002\u62C5\u5FE7\u518D\u6B21\u51FA\u73B0\u4E5F\u6CA1\u5173\u7CFB\uFF0C\u4E0D\u9700\u8981\u538B\u6291\u6216\u6D88\u706D\u5B83\u3002", "\u7EA6 3\u20135 \u5206\u949F"],
    reframe: ["\u628A\u5DF2\u7ECF\u53D1\u751F\u7684\u4E8B\uFF0C\u4E0E\u8111\u4E2D\u7684\u63A8\u6D4B\u5206\u5F00\u3002", "\u5BFB\u627E\u66F4\u8D34\u8FD1\u4E8B\u5B9E\u7684\u8868\u8FBE\uFF0C\u4E0D\u5FC5\u5F3A\u8FEB\u81EA\u5DF1\u4E50\u89C2\u3002\u771F\u5B9E\u7684\u8D85\u8D1F\u8377\u3001\u6B3A\u51CC\u6216\u4E0D\u5408\u7406\u8981\u6C42\u9700\u8981\u652F\u6301\u4E0E\u5DE5\u4F5C\u6761\u4EF6\u7684\u6539\u53D8\uFF0C\u4E0D\u662F\u9760\u6362\u4E2A\u60F3\u6CD5\u627F\u53D7\u4E0B\u53BB\u3002", "\u7EA6 5\u20138 \u5206\u949F"],
    plan: ["\u53EA\u5904\u7406\u4E00\u4EF6\u5177\u4F53\u7684\u4E8B\u3002", "\u60F3\u51FA\u4E24\u4E2A\u505A\u6CD5\uFF0C\u770B\u770B\u5404\u81EA\u9700\u8981\u4EC0\u4E48\uFF0C\u518D\u9009\u4E00\u4E2A\u53EF\u5C1D\u8BD5\u7684\u5C0F\u6B65\u9AA4\u3002\u8BA1\u5212\u53EF\u4EE5\u8C03\u6574\uFF0C\u4E0D\u9700\u8981\u4E00\u6B21\u89E3\u51B3\u5168\u90E8\u95EE\u9898\u3002", "\u7EA6 4\u20136 \u5206\u949F"],
    boundary: ["\u8BA9\u624B\u91CC\u7684\u4EFB\u52A1\u4E0E\u53EF\u6295\u5165\u7684\u65F6\u95F4\uFF0C\u90FD\u88AB\u770B\u89C1\u3002", "\u6574\u7406\u4E00\u4EFD\u53EF\u7F16\u8F91\u7684\u6C9F\u901A\u8349\u7A3F\u3002\u5982\u679C\u76F4\u63A5\u6C9F\u901A\u53EF\u80FD\u5E26\u6765\u98CE\u9669\uFF0C\u53EF\u4EE5\u5148\u627E\u53EF\u4FE1\u7684\u4EBA\u8BA8\u8BBA\u53EF\u884C\u7684\u652F\u6301\u65B9\u5F0F\uFF0C\u4E0D\u5FC5\u76F4\u63A5\u5BF9\u6297\u3002", "\u7EA6 4\u20136 \u5206\u949F"]
  };
  var NEXT_OPTIONS = [
    ["water", "\u559D\u51E0\u53E3\u6C34\uFF0C\u7A0D\u4F5C\u505C\u7559"],
    ["task", "\u56DE\u5230\u624B\u5934\u4EFB\u52A1\uFF0C\u53EA\u505A\u4E00\u4E2A\u5C0F\u6B65\u9AA4"],
    ["rest", "\u5148\u4F11\u606F\u4E00\u4F1A\u513F"],
    ["support", "\u627E\u4E00\u4F4D\u53EF\u4FE1\u7684\u4EBA\u8BF4\u8BF4"],
    ["custom", "\u5199\u4E00\u4E2A\u81EA\u5DF1\u7684\u5C0F\u884C\u52A8"]
  ];
  var STRATEGIES = [
    ["delay", "\u534F\u5546\u5EF6\u671F", "\u8BF4\u660E\u76EE\u524D\u5B89\u6392\uFF0C\u8BA8\u8BBA\u4E00\u4E2A\u53EF\u884C\u7684\u4EA4\u4ED8\u65F6\u95F4\u3002"],
    ["scope", "\u7F29\u5C0F\u8303\u56F4", "\u786E\u8BA4\u8FD9\u6B21\u6700\u9700\u8981\u4EA4\u4ED8\u7684\u90E8\u5206\uFF0C\u5176\u4F59\u53E6\u4F5C\u5B89\u6392\u3002"],
    ["priority", "\u6392\u51FA\u4F18\u5148\u7EA7", "\u8BA9\u4EFB\u52A1\u8D1F\u8D23\u4EBA\u660E\u786E\u5148\u505A\u54EA\u9879\u3001\u54EA\u9879\u53EF\u4EE5\u7B49\u5F85\u3002"],
    ["support", "\u8BF7\u6C42\u652F\u6301", "\u8BF4\u660E\u7F3A\u5C11\u7684\u65F6\u95F4\u3001\u4FE1\u606F\u6216\u534F\u4F5C\u8D44\u6E90\u3002"]
  ];
  var field = (key, label, placeholder, extra = {}) => ({ key, label, placeholder, ...extra });
  var choice = (key, label, options, extra = {}) => ({ key, label, options, type: "choice", ...extra });
  var nextFields = () => [
    choice("nextChoice", "\u63A5\u4E0B\u6765\uFF0C\u60F3\u505A\u54EA\u4E00\u4E2A\u5C0F\u884C\u52A8\uFF1F", NEXT_OPTIONS),
    field("nextCustom", "\u4F60\u81EA\u5DF1\u7684\u5C0F\u884C\u52A8", "\u6BD4\u5982\uFF1A\u6253\u5F00\u6587\u6863\uFF0C\u53EA\u5199\u7B2C\u4E00\u884C\u6807\u9898", { when: (d) => d.nextChoice === "custom" })
  ];
  var flow = (title, description, fields, extra = {}) => ({ title, description, fields, ...extra });
  var FLOWS = {
    worry: [
      flow("\u5148\u5199\u4E00\u4EF6\u62C5\u5FE7", "\u9009\u6B64\u523B\u6700\u5360\u5FC3\u7684\u4E00\u4EF6\u4E8B\uFF0C\u4E0D\u5FC5\u6574\u7406\u5168\u90E8\u70E6\u607C\u3002", [
        field("worry", "\u6211\u6B63\u5728\u62C5\u5FE7\u4EC0\u4E48\uFF1F", "\u6BD4\u5982\uFF1A\u660E\u5929\u8BC4\u5BA1\u53EF\u80FD\u6765\u4E0D\u53CA\u51C6\u5907")
      ]),
      flow("\u73B0\u5728\uFF0C\u6709\u53EF\u4EE5\u5F71\u54CD\u7684\u4E00\u5C0F\u6B65\u5417\uFF1F", "\u4E0D\u7528\u5224\u65AD\u62C5\u5FE7\u662F\u5426\u5408\u7406\uFF0C\u53EA\u770B\u73B0\u5728\u6709\u6CA1\u6709\u5177\u4F53\u3001\u53EF\u6267\u884C\u7684\u52A8\u4F5C\u3002\u62FF\u4E0D\u51C6\uFF0C\u4E5F\u53EF\u4EE5\u5148\u9009\u62E9\u6682\u65F6\u4E0D\u80FD\u884C\u52A8\u3002", [
        choice("route", "\u8FD9\u4EF6\u62C5\u5FE7\u76EE\u524D\u66F4\u63A5\u8FD1\u54EA\u4E00\u79CD\uFF1F", [
          ["act", "\u5177\u4F53\u3001\u53EF\u5904\u7406\u7684\u95EE\u9898", "\u6211\u80FD\u627E\u5230\u4E00\u4E2A\u9700\u8981\u505A\u6216\u53EF\u4EE5\u5C1D\u8BD5\u7684\u52A8\u4F5C\u3002"],
          ["later", "\u6682\u65F6\u4E0D\u80FD\u884C\u52A8\uFF0C\u6216\u662F\u5047\u8BBE\u6027\u7684\u62C5\u5FE7", "\u76EE\u524D\u6CA1\u6709\u53EF\u6267\u884C\u7684\u6B65\u9AA4\uFF0C\u6216\u7ED3\u679C\u4E0D\u7531\u6211\u63A7\u5236\u3002"]
        ])
      ]),
      flow("\u7ED9\u5B83\u4E00\u4E2A\u5408\u9002\u7684\u4F4D\u7F6E", "", [], { branch: "worry" }),
      flow("\u518D\u9009\u4E00\u4E2A\u773C\u524D\u7684\u5C0F\u884C\u52A8", "\u4E0D\u5FC5\u7B49\u62C5\u5FE7\u5B8C\u5168\u6D88\u5931\u518D\u884C\u52A8\u3002\u5B83\u518D\u6B21\u51FA\u73B0\u65F6\uFF0C\u53EF\u4EE5\u627F\u8BA4\u5B83\u8FD8\u5728\uFF0C\u518D\u628A\u6CE8\u610F\u529B\u653E\u56DE\u773C\u524D\u3002", nextFields())
    ],
    reframe: [
      flow("\u5148\u63CF\u8FF0\u53D1\u751F\u7684\u60C5\u5883", "\u50CF\u8BB0\u5F55\u73B0\u573A\u4E00\u6837\u5199\u4E0B\u65F6\u95F4\u3001\u4E8B\u4EF6\u6216\u5BF9\u65B9\u7684\u539F\u8BDD\uFF0C\u6682\u65F6\u4E0D\u6025\u7740\u4E0B\u7ED3\u8BBA\u3002", [
        field("situation", "\u53D1\u751F\u4E86\u4EC0\u4E48\uFF1F", "\u6BD4\u5982\uFF1A\u8BC4\u5BA1\u7ED3\u675F\u540E\uFF0C\u8D1F\u8D23\u4EBA\u53EA\u8BF4\u201C\u660E\u5929\u518D\u8C08\u201D")
      ]),
      flow("\u8111\u4E2D\u63A5\u7740\u51FA\u73B0\u4E86\u4EC0\u4E48\uFF1F", "\u63A8\u6D4B\u548C\u611F\u53D7\u90FD\u53EF\u4EE5\u88AB\u8BB0\u5F55\u3002\u611F\u53D7\u4E0D\u9700\u8981\u88AB\u8FA9\u9A73\uFF0C\u4E5F\u4E0D\u9700\u8981\u6253\u5206\u3002", [
        field("thought", "\u6211\u7684\u63A8\u6D4B\u6216\u8111\u4E2D\u7684\u8BDD", "\u6BD4\u5982\uFF1A\u4ED6\u4E00\u5B9A\u89C9\u5F97\u6211\u505A\u5F97\u5F88\u5DEE"),
        field("feeling", "\u8FD9\u8BA9\u6211\u6709\u4EC0\u4E48\u611F\u53D7\uFF1F", "\u6BD4\u5982\uFF1A\u62C5\u5FC3\u3001\u59D4\u5C48\uFF0C\u6709\u70B9\u7D27\u7EF7", { rows: 2 })
      ]),
      flow("\u8BA9\u4E8B\u5B9E\u6709\u4F4D\u7F6E", "\u53EA\u5199\u53EF\u89C2\u5BDF\u5230\u7684\u4FE1\u606F\uFF0C\u4E0D\u5F3A\u6C42\u4E24\u8FB9\u4E00\u6837\u591A\u3002\u5982\u679C\u8FD8\u6CA1\u6709\u76F8\u5173\u4E8B\u5B9E\uFF0C\u53EF\u4EE5\u5982\u5B9E\u5199\u201C\u76EE\u524D\u4E0D\u77E5\u9053\u201D\u3002", [
        field("for", "\u54EA\u4E9B\u4E8B\u5B9E\u652F\u6301\u8FD9\u4E2A\u63A8\u6D4B\uFF1F", "\u6BD4\u5982\uFF1A\u4ED6\u6307\u51FA\u4E86\u4E24\u5904\u9700\u8981\u4FEE\u6539\u7684\u5185\u5BB9"),
        field("against", "\u54EA\u4E9B\u4E8B\u5B9E\u4E0D\u652F\u6301\u5B83\uFF0C\u6216\u8BF4\u660E\u8FD8\u6709\u5176\u4ED6\u53EF\u80FD\uFF1F", "\u6BD4\u5982\uFF1A\u4ED6\u8FD8\u6CA1\u8BC4\u4EF7\u6574\u4F53\u65B9\u6848\uFF1B\u4F1A\u8BAE\u786E\u5B9E\u8D85\u65F6\u4E86")
      ]),
      flow("\u5199\u4E00\u53E5\u66F4\u8D34\u8FD1\u4E8B\u5B9E\u7684\u8BDD", "\u53EF\u4EE5\u4FDD\u7559\u4E0D\u786E\u5B9A\uFF0C\u4E5F\u53EF\u4EE5\u627F\u8BA4\u5904\u5883\u5F88\u96BE\u3002\u65E0\u9700\u628A\u8D1F\u9762\u7ED3\u8BBA\u6362\u6210\u79EF\u6781\u53E3\u53F7\u3002", [
        field("balanced", "\u6211\u613F\u610F\u6682\u65F6\u91C7\u7528\u7684\u8BF4\u6CD5", "\u6BD4\u5982\uFF1A\u6709\u4E24\u5904\u9700\u8981\u6539\uFF0C\u4F46\u76EE\u524D\u8FD8\u4E0D\u77E5\u9053\u4ED6\u5BF9\u6574\u4F53\u7684\u770B\u6CD5\uFF0C\u6211\u53EF\u4EE5\u786E\u8BA4")
      ]),
      flow("\u63A5\u4E0B\u6765\uFF0C\u505A\u4E00\u4EF6\u5C0F\u4E8B", "\u5C0F\u884C\u52A8\u53EF\u4EE5\u662F\u6F84\u6E05\u4FE1\u606F\u3001\u7167\u987E\u81EA\u5DF1\uFF0C\u6216\u5BFB\u6C42\u652F\u6301\u3002", nextFields())
    ],
    plan: [
      flow("\u628A\u95EE\u9898\u7F29\u5230\u53EF\u4EE5\u7740\u624B\u7684\u5927\u5C0F", "\u7528\u201C\u54EA\u4EF6\u4E8B\u9047\u5230\u4E86\u4EC0\u4E48\u963B\u788D\u201D\u6765\u63CF\u8FF0\uFF0C\u5148\u4E0D\u5904\u7406\u5BF9\u81EA\u5DF1\u7684\u8BC4\u4EF7\u3002", [
        field("problem", "\u8FD9\u6B21\u8981\u5904\u7406\u7684\u5177\u4F53\u95EE\u9898", "\u6BD4\u5982\uFF1A\u5468\u4E94\u8981\u4EA4\u62A5\u544A\uFF0C\u8FD8\u7F3A\u540C\u4E8B\u7684\u4E00\u7EC4\u6570\u636E")
      ]),
      flow("\u7B2C\u4E00\u4E2A\u53EF\u80FD\u7684\u505A\u6CD5", "\u5199\u4E00\u4E2A\u53EF\u5C1D\u8BD5\u7684\u65B9\u6848\uFF0C\u518D\u770B\u770B\u5B83\u9700\u8981\u591A\u5C11\u65F6\u95F4\u3001\u7CBE\u529B\u6216\u534F\u8C03\u3002", [
        field("optionA", "\u505A\u6CD5 A", "\u6BD4\u5982\uFF1A\u5148\u53D1\u6570\u636E\u6E05\u5355\uFF0C\u8BF7\u5BF9\u65B9\u786E\u8BA4\u80FD\u63D0\u4F9B\u7684\u65F6\u95F4"),
        field("costA", "A \u7684\u6210\u672C\u6216\u9650\u5236", "\u6BD4\u5982\uFF1A\u9700\u8981\u6574\u7406\u5341\u5206\u949F\uFF0C\u5BF9\u65B9\u4E5F\u53EF\u80FD\u6682\u65F6\u6CA1\u7A7A", { rows: 2 })
      ]),
      flow("\u518D\u60F3\u4E00\u4E2A\u4E0D\u540C\u7684\u505A\u6CD5", "\u4E0D\u6C42\u5B8C\u7F8E\uFF0C\u53EA\u8981\u4E0E\u4E0A\u4E00\u4E2A\u6709\u6240\u4E0D\u540C\u3002\u5BFB\u6C42\u5E2E\u52A9\u3001\u7F29\u5C0F\u8303\u56F4\u4E5F\u662F\u505A\u6CD5\u3002", [
        field("optionB", "\u505A\u6CD5 B", "\u6BD4\u5982\uFF1A\u5148\u7528\u5DF2\u6709\u6570\u636E\u5199\u7B80\u7248\uFF0C\u5E76\u8BF4\u660E\u7F3A\u5931\u90E8\u5206"),
        field("costB", "B \u7684\u6210\u672C\u6216\u9650\u5236", "\u6BD4\u5982\uFF1A\u7ED3\u8BBA\u4E0D\u5B8C\u6574\uFF0C\u9700\u8981\u63D0\u524D\u83B7\u5F97\u8BA4\u53EF", { rows: 2 })
      ]),
      flow("\u8FD9\u6B21\u5148\u5C1D\u8BD5\u54EA\u4E00\u4E2A\uFF1F", "\u4F9D\u636E\u76EE\u524D\u7684\u8D44\u6E90\u6765\u9009\u3002\u505A\u8FC7\u4E4B\u540E\u53EF\u4EE5\u518D\u8C03\u6574\uFF0C\u4E0D\u662F\u6C38\u4E45\u51B3\u5B9A\u3002", [
        choice("selected", "\u6211\u5148\u5C1D\u8BD5", [["a", "\u505A\u6CD5 A"], ["b", "\u505A\u6CD5 B"]], { dynamic: "plan" })
      ]),
      flow("\u628A\u884C\u52A8\u843D\u5230\u65F6\u95F4\u4E0E\u652F\u6301", "\u5199\u4E00\u4E2A\u8BA4\u5F97\u51FA\u6765\u7684\u5F00\u59CB\u65F6\u673A\u3002\u65E0\u9700\u4ED6\u4EBA\u652F\u6301\u65F6\uFF0C\u4E5F\u53EF\u4EE5\u660E\u786E\u5199\u201C\u5148\u72EC\u7ACB\u505A\u201D\u3002", [
        field("when", "\u4EC0\u4E48\u65F6\u5019\u5F00\u59CB\uFF1F", "\u6BD4\u5982\uFF1A\u4ECA\u5929\u4E0B\u5348\u4E24\u70B9\uFF0C\u4F1A\u8BAE\u7ED3\u675F\u540E", { rows: 2 }),
        field("support", "\u9700\u8981\u8C01\u3001\u4EC0\u4E48\u652F\u6301\uFF1F", "\u6BD4\u5982\uFF1A\u8BF7\u6570\u636E\u540C\u4E8B\u786E\u8BA4\u65F6\u95F4\uFF1B\u6216\u5148\u72EC\u7ACB\u6574\u7406\u6E05\u5355", { rows: 2 })
      ])
    ],
    boundary: [
      flow("\u5148\u770B\u5DF2\u6709\u4EFB\u52A1", "\u53EF\u4EE5\u53EA\u5199\u4EFB\u52A1\u4EE3\u79F0\uFF0C\u4E0D\u5FC5\u8F93\u5165\u540C\u4E8B\u59D3\u540D\u6216\u516C\u53F8\u673A\u5BC6\u3002\u5DE5\u4F5C\u91CF\u672C\u8EAB\u5C31\u662F\u9700\u8981\u8BA8\u8BBA\u7684\u4FE1\u606F\u3002", [
        field("tasks", "\u76EE\u524D\u5DF2\u7ECF\u627F\u8BFA\u7684\u4EFB\u52A1", "\u6BD4\u5982\uFF1A\u5468\u4E94\u4EA4\u6708\u62A5\uFF0C\u4ECA\u5929\u8FD8\u8981\u5B8C\u6210\u4E24\u4EFD\u590D\u6838")
      ]),
      flow("\u65B0\u589E\u4E86\u4EC0\u4E48\uFF0C\u65F6\u95F4\u6709\u591A\u5C11\uFF1F", "\u4EE5\u5B9E\u9645\u53EF\u6295\u5165\u7684\u65F6\u95F4\u4E3A\u51C6\uFF0C\u4E0D\u628A\u4F11\u606F\u65F6\u95F4\u9ED8\u8BA4\u4E3A\u53EF\u7528\u5DE5\u4F5C\u65F6\u95F4\u3002", [
        field("request", "\u65B0\u589E\u7684\u8981\u6C42", "\u6BD4\u5982\uFF1A\u4ECA\u5929\u4E0B\u73ED\u524D\u518D\u505A\u4E00\u7248\u6C47\u62A5\u6750\u6599"),
        field("capacity", "\u53EF\u6295\u5165\u7684\u65F6\u95F4\u6216\u7CBE\u529B", "\u6BD4\u5982\uFF1A\u4ECA\u5929\u8FD8\u6709\u4E00\u5C0F\u65F6\uFF0C\u65E0\u6CD5\u540C\u65F6\u5B8C\u6210\u6240\u6709\u4EFB\u52A1", { rows: 2 })
      ]),
      flow("\u9009\u4E00\u4E2A\u60F3\u534F\u5546\u7684\u65B9\u5411", "\u5148\u660E\u786E\u6700\u9700\u8981\u6539\u53D8\u7684\u5730\u65B9\uFF0C\u7A0D\u540E\u53EF\u4EE5\u4FEE\u6539\u6574\u6BB5\u8349\u7A3F\u3002", [
        choice("strategy", "\u8FD9\u6B21\u60F3\u8BA8\u8BBA\u4EC0\u4E48\uFF1F", STRATEGIES)
      ]),
      flow("\u9009\u62E9\u5B89\u5168\u3001\u5408\u9002\u7684\u6C9F\u901A\u65B9\u5F0F", "\u5982\u679C\u6709\u5A01\u80C1\u3001\u62A5\u590D\u98CE\u9669\u6216\u6B3A\u51CC\uFF0C\u4E0D\u9700\u8981\u628A\u76F4\u63A5\u5BF9\u6297\u5F53\u4F5C\u5FC5\u505A\u4EFB\u52A1\u3002\u53EF\u4EE5\u5148\u5411\u53EF\u4FE1\u7684\u4EBA\u6216\u53EF\u7528\u7684\u652F\u6301\u6E20\u9053\u4E86\u89E3\u9009\u62E9\u3002", [
        choice("safety", "\u54EA\u4E00\u79CD\u65B9\u5F0F\u66F4\u9002\u5408\u73B0\u5728\uFF1F", [
          ["direct", "\u6211\u89C9\u5F97\u53EF\u4EE5\u5C1D\u8BD5\u76F4\u63A5\u534F\u5546", "\u5148\u5199\u8349\u7A3F\uFF0C\u662F\u5426\u6C9F\u901A\u4ECD\u7531\u6211\u51B3\u5B9A\u3002"],
          ["trusted", "\u5148\u627E\u53EF\u4FE1\u652F\u6301\uFF0C\u4E0D\u76F4\u63A5\u534F\u5546", "\u548C\u53EF\u4FE1\u7684\u4EBA\u8BA8\u8BBA\u5982\u4F55\u4FDD\u62A4\u81EA\u5DF1\u3001\u6709\u54EA\u4E9B\u8D44\u6E90\u3002"]
        ])
      ]),
      flow("\u628A\u8349\u7A3F\u6539\u6210\u4F60\u81EA\u5DF1\u7684\u8BDD", "\u8FD9\u53EA\u662F\u8349\u7A3F\uFF0C\u4E0D\u4F1A\u53D1\u9001\uFF0C\u4E5F\u4E0D\u4F1A\u81EA\u52A8\u8054\u7CFB\u4E0A\u53F8\u6216\u4EFB\u4F55\u4EBA\u3002\u53EF\u5220\u6539\u63AA\u8F9E\u4E0E\u7EC6\u8282\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u4F7F\u7528\u3002", [
        field("draft", "\u53EF\u7F16\u8F91\u7684\u6C9F\u901A\u8349\u7A3F", "", { rows: 9, max: 7e3 })
      ], { draft: true }),
      flow("\u5148\u51B3\u5B9A\u4E0B\u4E00\u5C0F\u6B65", "\u53EF\u4EE5\u5148\u68C0\u67E5\u63AA\u8F9E\u3001\u6682\u65F6\u4F11\u606F\uFF0C\u6216\u79C1\u4E0B\u5BFB\u627E\u53EF\u4FE1\u652F\u6301\u3002\u5B8C\u6210\u7EC3\u4E60\u4E0D\u8981\u6C42\u53D1\u51FA\u8349\u7A3F\u3002", nextFields())
    ]
  };
  var EXAMPLES = {
    worry: {
      worry: "\u660E\u5929\u4E0B\u5348\u8981\u505A\u9879\u76EE\u8BC4\u5BA1\uFF0C\u6211\u62C5\u5FC3\u5173\u952E\u6570\u636E\u8FD8\u6CA1\u51C6\u5907\u597D\u3002",
      route: "act",
      action: "\u5217\u51FA\u7F3A\u5931\u7684\u4E24\u9879\u6570\u636E\uFF0C\u5411\u534F\u4F5C\u540C\u4E8B\u786E\u8BA4\u53EF\u63D0\u4F9B\u7684\u65F6\u95F4\u3002",
      when: "\u4ECA\u5929\u4E0B\u5348\u4E24\u70B9\uFF0C\u5348\u95F4\u4F11\u606F\u4E4B\u540E\u3002",
      worryTime: "\u4ECA\u5929\u665A\u996D\u540E\uFF0C19:30 \u5F00\u59CB\u3002",
      worryMinutes: "10",
      nextChoice: "custom",
      nextCustom: "\u6253\u5F00\u8BC4\u5BA1\u6587\u6863\uFF0C\u5148\u6807\u51FA\u7F3A\u6570\u636E\u7684\u4E24\u5904\u3002"
    },
    reframe: {
      situation: "\u8BC4\u5BA1\u65F6\u8D1F\u8D23\u4EBA\u6307\u51FA\u4E24\u5904\u95EE\u9898\uFF0C\u7ED3\u675F\u65F6\u8BF4\u201C\u660E\u5929\u518D\u8C08\u201D\u3002",
      thought: "\u4ED6\u4E00\u5B9A\u89C9\u5F97\u6211\u4E0D\u80DC\u4EFB\u8FD9\u9879\u5DE5\u4F5C\u3002",
      feeling: "\u62C5\u5FC3\uFF0C\u4E5F\u6709\u4E00\u70B9\u59D4\u5C48\u3002",
      for: "\u4ED6\u786E\u5B9E\u6307\u51FA\u4E86\u4E24\u5904\u9700\u8981\u4FEE\u6539\u7684\u5185\u5BB9\u3002",
      against: "\u4ED6\u6CA1\u6709\u8BC4\u4EF7\u6211\u7684\u6574\u4F53\u80FD\u529B\u3002\u4F1A\u8BAE\u5DF2\u7ECF\u8D85\u65F6\uFF0C\u5176\u4ED6\u8BAE\u9898\u4E5F\u6CA1\u8C08\u5B8C\u3002",
      balanced: "\u8FD9\u4E24\u5904\u5185\u5BB9\u9700\u8981\u4FEE\u6539\uFF0C\u4F46\u76EE\u524D\u4E0D\u77E5\u9053\u4ED6\u5BF9\u6574\u4F53\u7684\u770B\u6CD5\u3002\u6211\u53EF\u4EE5\u5148\u4FEE\u6539\u5E76\u95EE\u6E05\u671F\u5F85\u3002",
      nextChoice: "custom",
      nextCustom: "\u5199\u4E0B\u660E\u5929\u60F3\u786E\u8BA4\u7684\u4E00\u4E2A\u95EE\u9898\uFF1A\u8FD9\u7248\u6700\u9700\u8981\u4F18\u5148\u6539\u54EA\u91CC\uFF1F"
    },
    plan: {
      problem: "\u5468\u4E94\u4EA4\u6708\u62A5\uFF0C\u8FD8\u7F3A\u540C\u4E8B\u63D0\u4F9B\u7684\u4E00\u7EC4\u6570\u636E\u3002",
      optionA: "\u5217\u51FA\u7F3A\u5931\u6570\u636E\u6E05\u5355\uFF0C\u8BF7\u540C\u4E8B\u786E\u8BA4\u63D0\u4F9B\u65F6\u95F4\u3002",
      costA: "\u9700\u8981\u5341\u5206\u949F\u6574\u7406\uFF0C\u5BF9\u65B9\u53EF\u80FD\u4E5F\u5728\u5FD9\uFF0C\u8981\u5141\u8BB8\u534F\u5546\u65F6\u95F4\u3002",
      optionB: "\u5148\u5199\u5DF2\u6709\u6570\u636E\u7684\u7B80\u7248\uFF0C\u5411\u8D1F\u8D23\u4EBA\u8BF4\u660E\u7F3A\u5931\u90E8\u5206\u3002",
      costB: "\u7ED3\u8BBA\u6682\u65F6\u4E0D\u5B8C\u6574\uFF0C\u9700\u8981\u8D1F\u8D23\u4EBA\u63A5\u53D7\u5206\u9636\u6BB5\u4EA4\u4ED8\u3002",
      selected: "a",
      when: "\u4ECA\u5929\u4E0B\u5348\u4E24\u70B9\uFF0C\u5148\u82B1\u5341\u5206\u949F\u6574\u7406\u6E05\u5355\u3002",
      support: "\u9700\u8981\u8D1F\u8D23\u6570\u636E\u7684\u540C\u4E8B\u786E\u8BA4\u53EF\u63D0\u4F9B\u65F6\u95F4\u3002"
    },
    boundary: {
      tasks: "\u5468\u4E94\u4EA4\u6708\u62A5\uFF0C\u4ECA\u5929\u5B8C\u6210\u4E24\u4EFD\u590D\u6838\u3002",
      request: "\u4ECA\u5929\u4E0B\u73ED\u524D\u8865\u4E00\u7248\u6C47\u62A5\u6750\u6599\u3002",
      capacity: "\u4ECA\u5929\u53EF\u6295\u5165\u7EA6\u4E00\u5C0F\u65F6\uFF0C\u4E09\u9879\u65E0\u6CD5\u540C\u65F6\u5B8C\u6210\u3002",
      strategy: "priority",
      safety: "direct",
      nextChoice: "custom",
      nextCustom: "\u5148\u6838\u5BF9\u8FD9\u4E09\u9879\u4EFB\u52A1\u7684\u622A\u6B62\u65F6\u95F4\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u4F7F\u7528\u8349\u7A3F\u3002"
    }
  };
  var GROUND = [
    ["\u8BA9\u89C6\u7EBF\u843D\u5728\u8EAB\u8FB9", "\u7741\u7740\u773C\uFF0C\u770B\u770B\u4E00\u4E2A\u8EAB\u8FB9\u7684\u7269\u4F53\u3002\u7559\u610F\u5B83\u7684\u989C\u8272\u3001\u8F6E\u5ED3\u6216\u5149\u5F71\uFF0C\u505C\u7559\u591A\u4E45\u7531\u4F60\u51B3\u5B9A\u3002", "\u6211\u7559\u610F\u5230\u7684\u4E1C\u897F\uFF08\u9009\u586B\uFF09", "\u6BD4\u5982\uFF1A\u684C\u89D2\u7684\u5149\uFF0C\u676F\u5B50\u7684\u8FB9\u7F18"],
    ["\u7559\u610F\u8EAB\u4F53\u5F97\u5230\u7684\u652F\u6491", "\u611F\u53D7\u811A\u4E0B\u3001\u6905\u80CC\u3001\u5750\u57AB\u6216\u624B\u81C2\u4E0B\u7684\u652F\u6491\u3002\u9009\u4E00\u4E2A\u8212\u670D\u7684\u4F4D\u7F6E\u5C31\u597D\uFF0C\u4E0D\u5FC5\u6539\u53D8\u59FF\u52BF\u3002", "\u6211\u611F\u53D7\u5230\u7684\u652F\u6491\uFF08\u9009\u586B\uFF09", "\u6BD4\u5982\uFF1A\u6905\u80CC\u6258\u7740\u6211\u7684\u540E\u80CC"],
    ["\u542C\u542C\u6B64\u523B\u7684\u73AF\u5883", "\u7559\u610F\u6B64\u523B\u53EF\u542C\u5230\u7684\u58F0\u97F3\uFF0C\u8FD1\u5904\u6216\u8FDC\u5904\u90FD\u53EF\u4EE5\u3002\u5B89\u9759\u4E5F\u7B97\u4E00\u79CD\u89C2\u5BDF\u3002\u542C\u89C9\u4E0D\u65B9\u4FBF\u65F6\u53EF\u4EE5\u8DF3\u8FC7\u3002", "\u6211\u542C\u5230\u6216\u7559\u610F\u5230\u7684\uFF08\u9009\u586B\uFF09", "\u6BD4\u5982\uFF1A\u7A7A\u8C03\u7684\u58F0\u97F3\uFF0C\u6216\u6B64\u523B\u6BD4\u8F83\u5B89\u9759"]
  ];
  var instanceNumber = 0;
  var clean = (value) => String(value ?? "").trim();
  var escape = (value) => escapeHTML(String(value ?? ""));
  var labelOf = (options, value) => options.find((option) => option[0] === value)?.[1] || "";
  var formatTime = (ms) => {
    const seconds = Math.floor(ms / 1e3);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  function mountPractice(id, container, { onComplete, onExit, onHelp, onPracticeChange } = {}) {
    if (!Object.hasOwn(TITLES, id)) throw new RangeError(`Unknown practice: ${id}`);
    if (!container || typeof container.replaceChildren !== "function") throw new TypeError("A container element is required");
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    const prefix = `cp-${++instanceNumber}`;
    const root = doc.createElement("section");
    root.className = "cp-practice";
    root.setAttribute("aria-label", TITLES[id]);
    container.replaceChildren(root);
    const sessions = /* @__PURE__ */ new Map();
    const history2 = [];
    let disposed = false;
    let finished = false;
    let raf = null;
    let startedAt = null;
    let timerOwner = null;
    let blurred = !doc.hasFocus();
    let helpOpen = false;
    const reducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)");
    function session(practiceId, isExample = false) {
      const key = `${practiceId}:${isExample}`;
      if (!sessions.has(key)) sessions.set(key, {
        id: practiceId,
        isExample,
        view: "intro",
        step: 0,
        data: isExample ? { ...EXAMPLES[practiceId] } : {},
        errors: {},
        elapsed: 0,
        timerStatus: "idle",
        timerNote: "",
        draftSource: "",
        generatedDraft: "",
        draftStale: false
      });
      return sessions.get(key);
    }
    let current = session(id);
    function stopClock() {
      if (startedAt !== null && timerOwner) {
        timerOwner.elapsed = Math.min(12e4, timerOwner.elapsed + Math.max(0, win.performance.now() - startedAt));
      }
      startedAt = null;
      timerOwner = null;
      if (raf !== null) win.cancelAnimationFrame(raf);
      raf = null;
    }
    function pauseClock(reason = "\u5DF2\u6682\u505C\u3002\u51C6\u5907\u597D\u540E\uFF0C\u53EF\u81EA\u5DF1\u9009\u62E9\u7EE7\u7EED\u3002") {
      if (current.timerStatus !== "running") return;
      stopClock();
      current.timerStatus = "paused";
      current.timerNote = reason;
      if (!disposed) updateClock();
    }
    function cleanup2() {
      if (disposed) return;
      stopClock();
      disposed = true;
      root.removeEventListener("click", handleClick);
      root.removeEventListener("input", handleInput);
      root.removeEventListener("change", handleInput);
      root.removeEventListener("submit", handleSubmit);
      container.removeEventListener("songjian:pause", onHostPause);
      doc.removeEventListener("visibilitychange", onVisibility);
      win.removeEventListener("blur", onBlur);
      win.removeEventListener("focus", onFocus);
      win.removeEventListener("pagehide", onPageHide);
      reducedMotion?.removeEventListener?.("change", onMotionChange);
      sessions.clear();
      history2.length = 0;
      current = null;
      root.remove();
    }
    function onBlur() {
      blurred = true;
      pauseClock("\u7A97\u53E3\u5931\u53BB\u7126\u70B9\uFF0C\u5DF2\u6682\u505C\u8BA1\u65F6\u3002\u56DE\u6765\u540E\u53EF\u624B\u52A8\u7EE7\u7EED\u3002");
    }
    function onFocus() {
      blurred = false;
    }
    function onVisibility() {
      if (doc.hidden) pauseClock("\u9875\u9762\u8FDB\u5165\u540E\u53F0\uFF0C\u5DF2\u6682\u505C\u8BA1\u65F6\u3002\u56DE\u6765\u540E\u53EF\u624B\u52A8\u7EE7\u7EED\u3002");
    }
    function onPageHide() {
      pauseClock("\u9875\u9762\u5DF2\u79BB\u5F00\uFF0C\u8BA1\u65F6\u6682\u505C\u3002");
    }
    function onHostPause() {
      pauseClock("\u5DF2\u6682\u505C\u8BA1\u65F6\u3002\u5173\u95ED\u5F39\u5C42\u540E\uFF0C\u51C6\u5907\u597D\u518D\u6309\u201C\u7EE7\u7EED\u201D\u3002");
    }
    function onMotionChange() {
      if (!disposed && current.id === "settle") updateClock();
    }
    function button(action, text, kind = "secondary", extra = "") {
      return `<button type="button" class="cp-button cp-button--${kind}" data-cp-action="${action}" ${extra}>${text}</button>`;
    }
    function fieldsFor(index = current.step) {
      const data = current.data;
      if (current.id === "ground") {
        return index < 3 ? [field(`ground${index}`, GROUND[index][2], GROUND[index][3], { optional: true, rows: 2 })] : nextFields().filter((f) => !f.when || f.when(data));
      }
      if (current.id === "settle") return nextFields().filter((f) => !f.when || f.when(data));
      let fields = FLOWS[current.id][index].fields;
      if (current.id === "worry" && index === 2) {
        fields = data.route === "act" ? [
          field("action", "\u6211\u53EF\u4EE5\u505A\u7684\u4E0B\u4E00\u6B65", "\u5199\u4E00\u4E2A\u8DB3\u591F\u5C0F\u3001\u80FD\u591F\u5F00\u59CB\u7684\u52A8\u4F5C"),
          field("when", "\u4EC0\u4E48\u65F6\u5019\u505A\uFF1F", "\u6BD4\u5982\uFF1A\u4ECA\u5929\u4E0B\u5348\u4E24\u70B9\uFF0C\u4F1A\u8BAE\u7ED3\u675F\u540E", { rows: 2 })
        ] : [
          field("worryTime", "\u7559\u7ED9\u62C5\u5FE7\u7684\u65F6\u6BB5\uFF0C\u4ECE\u4EC0\u4E48\u65F6\u5019\u5F00\u59CB\uFF1F", "\u6BD4\u5982\uFF1A\u4ECA\u5929\u665A\u996D\u540E\uFF0C19:30 \u5F00\u59CB", { rows: 2 }),
          choice("worryMinutes", "\u8FD9\u6B21\u7559\u591A\u957F\u65F6\u95F4\uFF1F", [["10", "10 \u5206\u949F"], ["15", "15 \u5206\u949F"]])
        ];
      }
      if (current.id === "boundary" && index === 4 && current.draftStale) {
        fields = [...fields, choice("draftChecked", "\u524D\u9762\u7684\u4FE1\u606F\u6539\u8FC7\u4E86\uFF0C\u8BF7\u6838\u5BF9\u8FD9\u6BB5\u8349\u7A3F", [
          ["checked", data.safety === "trusted" ? "\u6211\u5DF2\u6838\u5BF9\uFF1A\u8FD9\u6BB5\u53EA\u7528\u4E8E\u5411\u53EF\u4FE1\u7684\u4EBA\u5BFB\u6C42\u652F\u6301" : "\u6211\u5DF2\u6838\u5BF9\uFF1A\u8349\u7A3F\u7B26\u5408\u5F53\u524D\u4EFB\u52A1\u3001\u65F6\u95F4\u4E0E\u6C9F\u901A\u65B9\u5F0F"]
        ])];
      }
      return fields.filter((f) => !f.when || f.when(data));
    }
    function getOptions(f) {
      if (f.dynamic === "plan") return [
        ["a", "\u505A\u6CD5 A", current.data.optionA],
        ["b", "\u505A\u6CD5 B", current.data.optionB]
      ];
      return f.options;
    }
    function fieldHTML(f) {
      const domId = `${prefix}-${f.key}`;
      const error = current.errors[f.key];
      const description = `${domId}-error${f.hint ? ` ${domId}-hint` : ""}`;
      const value = current.data[f.key] ?? "";
      const errorHTML = `<p class="cp-error" id="${domId}-error" ${error ? "" : "hidden"}>${escape(error)}</p>`;
      if (f.type === "choice") {
        return `<fieldset class="cp-field cp-choice-field" data-cp-field="${f.key}" aria-describedby="${description}" ${error ? 'aria-invalid="true"' : ""}>
        <legend class="cp-label">${escape(f.label)}<span class="cp-required">\u5FC5\u9009</span></legend>
        <div class="cp-options">${getOptions(f).map(([key, label, detail]) => `<label class="cp-option">
          <input class="cp-radio" type="radio" name="${domId}" value="${escape(key)}" data-cp-key="${f.key}" ${value === key ? "checked" : ""} aria-describedby="${description}" ${error ? 'aria-invalid="true"' : ""}>
          <span class="cp-option-copy"><span class="cp-option-title">${escape(label)}</span>${detail ? `<span class="cp-option-detail">${escape(detail)}</span>` : ""}</span>
        </label>`).join("")}</div>${errorHTML}</fieldset>`;
      }
      return `<div class="cp-field" data-cp-field="${f.key}">
      <label class="cp-label" for="${domId}">${escape(f.label)}${f.optional ? "" : '<span class="cp-required">\u5FC5\u586B</span>'}</label>
      ${f.hint ? `<p class="cp-hint" id="${domId}-hint">${escape(f.hint)}</p>` : ""}
      <textarea class="cp-textarea" id="${domId}" data-cp-key="${f.key}" rows="${f.rows || 3}" maxlength="${f.max || 1200}" placeholder="${escape(f.placeholder)}" aria-describedby="${description}" ${f.optional ? "" : 'aria-required="true"'} ${error ? 'aria-invalid="true"' : ""}>${escape(value)}</textarea>
      ${errorHTML}</div>`;
    }
    function validate(fields = fieldsFor()) {
      const errors = {};
      for (const f of fields) {
        const value = clean(current.data[f.key]);
        if (!f.optional && !value) errors[f.key] = f.type === "choice" ? "\u8BF7\u9009\u62E9\u4E00\u4E2A\u9002\u5408\u6B64\u523B\u7684\u9009\u9879\u3002" : "\u8BF7\u5199\u4E00\u70B9\u5177\u4F53\u5185\u5BB9\uFF0C\u518D\u7EE7\u7EED\u3002";
        else if (f.type === "choice" && value && !getOptions(f).some((o) => o[0] === value)) errors[f.key] = "\u8BF7\u91CD\u65B0\u9009\u62E9\u4E00\u4E2A\u9009\u9879\u3002";
        else if (f.type !== "choice" && value.length > (f.max || 1200)) errors[f.key] = `\u8BF7\u7F29\u77ED\u5230 ${f.max || 1200} \u5B57\u4EE5\u5185\u3002`;
      }
      current.errors = errors;
      return !Object.keys(errors).length;
    }
    function stepCount() {
      return current.id === "ground" ? 4 : current.id === "settle" ? 1 : FLOWS[current.id].length;
    }
    function nextAction() {
      if (current.id === "plan") {
        return `${clean(current.data.when)} \xB7 ${clean(current.data[current.data.selected === "a" ? "optionA" : "optionB"])}`;
      }
      return current.data.nextChoice === "custom" ? clean(current.data.nextCustom) : labelOf(NEXT_OPTIONS, current.data.nextChoice);
    }
    function draftSource() {
      const d = current.data;
      return JSON.stringify([d.tasks, d.request, d.capacity, d.strategy, d.safety]);
    }
    function makeDraft() {
      const d = current.data;
      if (d.safety === "trusted") {
        return `\u6211\u60F3\u5148\u548C\u4F60\u79C1\u4E0B\u8BA8\u8BBA\u4E00\u4EF6\u5DE5\u4F5C\u5B89\u6392\u4E0A\u7684\u4E8B\u3002

\u6211\u76EE\u524D\u5728\u505A\uFF1A${clean(d.tasks)}
\u65B0\u589E\u8981\u6C42\u662F\uFF1A${clean(d.request)}
\u6211\u5B9E\u9645\u80FD\u6295\u5165\u7684\u65F6\u95F4\u662F\uFF1A${clean(d.capacity)}

\u6211\u5E0C\u671B\u4E89\u53D6\u7684\u65B9\u5411\u662F\u201C${labelOf(STRATEGIES, d.strategy)}\u201D\u3002\u6211\u62C5\u5FC3\u76F4\u63A5\u6C9F\u901A\u53EF\u80FD\u5E26\u6765\u98CE\u9669\uFF0C\u60F3\u5148\u542C\u542C\u4F60\u7684\u770B\u6CD5\uFF0C\u4E86\u89E3\u6709\u54EA\u4E9B\u5B89\u5168\u7684\u652F\u6301\u65B9\u5F0F\u3002\u8BF7\u5148\u4E0D\u8981\u66FF\u6211\u8F6C\u8FBE\u6216\u8054\u7CFB\u76F8\u5173\u4EBA\u5458\uFF0C\u6211\u4EEC\u80FD\u5426\u5148\u7EA6\u4E00\u4E2A\u5408\u9002\u7684\u65F6\u95F4\u804A\u804A\uFF1F`;
      }
      const request = {
        delay: "\u80FD\u5426\u4E00\u8D77\u786E\u8BA4\u4E00\u4E2A\u53EF\u884C\u7684\u65B0\u4EA4\u4ED8\u65F6\u95F4\uFF1F\u6211\u60F3\u5148\u5BF9\u9F50\u6700\u665A\u9700\u8981\u7684\u65F6\u95F4\uFF0C\u518D\u660E\u786E\u80FD\u627F\u8BFA\u7684\u5B89\u6392\u3002",
        scope: "\u80FD\u5426\u5148\u786E\u8BA4\u8FD9\u6B21\u5FC5\u987B\u4EA4\u4ED8\u7684\u90E8\u5206\uFF0C\u5E76\u7F29\u5C0F\u672C\u6B21\u8303\u56F4\uFF1F\u5176\u4F59\u5185\u5BB9\u5E0C\u671B\u53E6\u884C\u5B89\u6392\u3002",
        priority: "\u80FD\u5426\u4E00\u8D77\u786E\u8BA4\u8FD9\u4E9B\u4EFB\u52A1\u7684\u4F18\u5148\u7EA7\uFF0C\u4EE5\u53CA\u54EA\u9879\u53EF\u4EE5\u7B49\u5F85\uFF1F\u786E\u5B9A\u53D6\u820D\u540E\uFF0C\u6211\u518D\u5BF9\u9F50\u76F8\u5E94\u7684\u4EA4\u4ED8\u5B89\u6392\u3002",
        support: "\u80FD\u5426\u8BA8\u8BBA\u53EF\u4EE5\u63D0\u4F9B\u54EA\u4E9B\u4EBA\u624B\u3001\u4FE1\u606F\u6216\u65F6\u95F4\u652F\u6301\uFF1F\u5982\u679C\u8D44\u6E90\u6682\u65F6\u65E0\u6CD5\u8865\u5145\uFF0C\u5E0C\u671B\u4E00\u8D77\u8C03\u6574\u8303\u56F4\u6216\u671F\u9650\u3002"
      }[d.strategy];
      return `\u60F3\u548C\u4F60\u786E\u8BA4\u4E00\u4E0B\u5DE5\u4F5C\u5B89\u6392\u3002

\u76EE\u524D\u5DF2\u7ECF\u5728\u505A\uFF1A${clean(d.tasks)}
\u8FD9\u6B21\u65B0\u589E\u7684\u8981\u6C42\u662F\uFF1A${clean(d.request)}
\u6211\u5B9E\u9645\u53EF\u6295\u5165\u7684\u65F6\u95F4\u662F\uFF1A${clean(d.capacity)}

${request}

\u6211\u5E0C\u671B\u628A\u5DE5\u4F5C\u91CF\u3001\u53EF\u7528\u65F6\u95F4\u548C\u4EA4\u4ED8\u9884\u671F\u5148\u5BF9\u9F50\uFF0C\u518D\u786E\u8BA4\u4E0B\u4E00\u6B65\u3002`;
    }
    function prepareDraft() {
      if (current.id !== "boundary" || current.step !== 4) return;
      const source = draftSource();
      if (!current.draftSource || current.draftSource !== source && current.data.draft === current.generatedDraft) {
        current.data.draft = makeDraft();
        current.generatedDraft = current.data.draft;
        current.draftSource = source;
        current.data.draftChecked = "";
      }
      current.draftStale = current.draftSource !== source;
    }
    function summary() {
      const d = current.data;
      const row = (label, value) => ({ label, value: clean(value) });
      switch (current.id) {
        case "settle":
          return [
            row("\u5B9E\u9645\u7EC3\u4E60\u65F6\u95F4", `${formatTime(current.elapsed)}\uFF08\u53EA\u7D2F\u8BA1\u524D\u53F0\u7EC3\u4E60\u65F6\u95F4\uFF09`),
            row("\u7ED3\u675F\u65B9\u5F0F", current.elapsed >= 12e4 ? "\u4E24\u5206\u949F\u5DF2\u5230\uFF0C\u7531\u4F60\u51B3\u5B9A\u63A5\u4E0B\u6765\u505A\u4EC0\u4E48" : "\u63D0\u524D\u7ED3\u675F\uFF0C\u6309\u81EA\u5DF1\u7684\u9700\u8981\u505C\u4E0B")
          ];
        case "ground":
          return GROUND.map((s, i) => row(
            ["\u770B\u89C1\u5468\u56F4", "\u611F\u53D7\u652F\u6491", "\u542C\u89C1\u73AF\u5883"][i],
            d[`groundState${i}`] === "skipped" ? "\u8FD9\u4E00\u9879\u6682\u65F6\u8DF3\u8FC7" : clean(d[`ground${i}`]) || "\u5DF2\u6309\u81EA\u5DF1\u7684\u8282\u594F\u7559\u610F"
          ));
        case "worry":
          return [
            row("\u8FD9\u4EF6\u62C5\u5FE7", d.worry),
            row("\u76EE\u524D\u7684\u5206\u6D41", d.route === "act" ? "\u6709\u5177\u4F53\u53EF\u5904\u7406\u7684\u95EE\u9898" : "\u6682\u4E0D\u80FD\u884C\u52A8\uFF0C\u6216\u662F\u5047\u8BBE\u6027\u62C5\u5FE7"),
            ...d.route === "act" ? [row("\u53EF\u505A\u7684\u4E0B\u4E00\u6B65", d.action), row("\u884C\u52A8\u65F6\u95F4", d.when)] : [
              row("\u7559\u7ED9\u62C5\u5FE7\u7684\u65F6\u6BB5", `${clean(d.worryTime)} \xB7 ${d.worryMinutes} \u5206\u949F`),
              row("\u65F6\u6BB5\u8BF4\u660E", "\u8FD9\u662F\u81EA\u5DF1\u8BB0\u4E0B\u7684\u5B89\u6392\uFF0C\u4E0D\u662F\u81EA\u52A8\u63D0\u9192\uFF1B\u62C5\u5FE7\u51FA\u73B0\u65F6\u4E0D\u5FC5\u538B\u6291\u5B83\u3002")
            ]
          ];
        case "reframe":
          return [
            row("\u60C5\u5883", d.situation),
            row("\u8111\u4E2D\u7684\u63A8\u6D4B", d.thought),
            row("\u611F\u53D7", d.feeling),
            row("\u652F\u6301\u63A8\u6D4B\u7684\u4E8B\u5B9E", d.for),
            row("\u4E0D\u652F\u6301\u6216\u4FDD\u7559\u5176\u4ED6\u53EF\u80FD\u7684\u4E8B\u5B9E", d.against),
            row("\u66F4\u8D34\u8FD1\u4E8B\u5B9E\u7684\u8BF4\u6CD5", d.balanced)
          ];
        case "plan":
          return [
            row("\u5177\u4F53\u95EE\u9898", d.problem),
            row("\u505A\u6CD5 A", d.optionA),
            row("A \u7684\u6210\u672C\u6216\u9650\u5236", d.costA),
            row("\u505A\u6CD5 B", d.optionB),
            row("B \u7684\u6210\u672C\u6216\u9650\u5236", d.costB),
            row("\u8FD9\u6B21\u9009\u62E9", `\u505A\u6CD5 ${d.selected === "a" ? "A" : "B"}\uFF1A${clean(d[d.selected === "a" ? "optionA" : "optionB"])}`),
            row("\u5F00\u59CB\u65F6\u95F4", d.when),
            row("\u9700\u8981\u7684\u652F\u6301", d.support)
          ];
        case "boundary":
          return [
            row("\u5DF2\u6709\u4EFB\u52A1", d.tasks),
            row("\u65B0\u589E\u8981\u6C42", d.request),
            row("\u53EF\u6295\u5165\u65F6\u95F4", d.capacity),
            row("\u534F\u5546\u65B9\u5411", labelOf(STRATEGIES, d.strategy)),
            row("\u6C9F\u901A\u65B9\u5F0F", d.safety === "trusted" ? "\u5148\u627E\u53EF\u4FE1\u652F\u6301\uFF0C\u4E0D\u76F4\u63A5\u534F\u5546" : "\u5728\u89C9\u5F97\u5B89\u5168\u7684\u524D\u63D0\u4E0B\u8003\u8651\u534F\u5546"),
            row("\u672A\u53D1\u9001\u7684\u6C9F\u901A\u8349\u7A3F", d.draft)
          ];
        default:
          return [];
      }
    }
    function progressHTML() {
      if (!["step", "review"].includes(current.view)) return "";
      const count = stepCount() + 1;
      const index = current.view === "review" ? count : current.step + 1;
      return `<div class="cp-progress"><div class="cp-progress-top"><span>${current.view === "review" ? "\u6700\u540E \xB7 \u786E\u8BA4\u5185\u5BB9" : `\u7B2C ${index} \u6B65 / ${count} \u6B65`}</span><span>${current.isExample ? "\u804C\u573A\u4F8B\u5B50\u4F53\u9A8C" : "\u6309\u81EA\u5DF1\u7684\u8282\u594F"}</span></div>
      <div class="cp-progress-track" role="progressbar" aria-label="\u7EC3\u4E60\u6B65\u9AA4" aria-valuemin="0" aria-valuemax="${count}" aria-valuenow="${index}"><span class="cp-progress-fill" style="width:${index / count * 100}%"></span></div></div>`;
    }
    function alternateHTML() {
      if (current.id === "settle") return `<aside class="cp-alternative"><p>\u4E0D\u60F3\u5173\u6CE8\u547C\u5438\uFF0C\u4E5F\u53EF\u4EE5\u7741\u773C\u770B\u770B\u5468\u56F4\u3002</p>${button("switch-ground", "\u6539\u505A\u300C\u56DE\u5230\u5F53\u4E0B\u300D", "quiet")}</aside>`;
      if (current.id === "reframe") return `<aside class="cp-alternative"><p>\u5982\u679C\u9762\u5BF9\u7684\u662F\u6301\u7EED\u8D85\u8D1F\u8377\u3001\u6B3A\u51CC\u6216\u4E0D\u5408\u7406\u8981\u6C42\uFF0C\u4E8B\u5B9E\u4E0D\u9700\u8981\u88AB\u201C\u60F3\u5F00\u201D\u3002\u5DE5\u4F5C\u6761\u4EF6\u4E5F\u9700\u8981\u6539\u53D8\u3002</p>${button("switch-boundary", "\u8F6C\u5230\u300C\u5DE5\u4F5C\u8FB9\u754C\u4E0E\u534F\u5546\u300D", "quiet")}</aside>`;
      return "";
    }
    function introHTML() {
      const meta = META[current.id];
      return `<div class="cp-intro-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="cp-eyebrow">${escape(meta[2])} \xB7 \u968F\u65F6\u53EF\u4EE5\u505C\u4E0B</p>
      <h2 class="cp-heading" tabindex="-1">${escape(meta[0])}</h2>
      <p class="cp-lead">${escape(meta[1])}</p>
      <div class="cp-intro-actions">${button("start", current.id === "settle" ? "\u8FDB\u5165\u547C\u5438\u7EC3\u4E60" : "\u4ECE\u8FD9\u91CC\u5F00\u59CB", "primary")}
      ${EXAMPLES[current.id] && !current.isExample ? button("example", "\u7528\u4E00\u4E2A\u804C\u573A\u4F8B\u5B50\u4F53\u9A8C") : ""}</div>
      <p class="cp-hint">\u4E0D\u5FC5\u5199\u59D3\u540D\u6216\u654F\u611F\u4FE1\u606F\u3002\u8F93\u5165\u53EA\u5728\u672C\u6B21\u9875\u9762\u4E2D\u4E34\u65F6\u4FDD\u7559\uFF1B\u9000\u51FA\u540E\u6E05\u9664\u3002\u786E\u8BA4\u5B8C\u6210\u65F6\uFF0C\u6574\u7406\u7ED3\u679C\u4F1A\u4EA4\u56DE\u672C\u9875\u3002</p>`;
    }
    function clockHTML() {
      return `<h2 class="cp-heading cp-heading--center" tabindex="-1">\u4FDD\u6301\u4F60\u8212\u670D\u7684\u547C\u5438\u3002</h2>
      <p class="cp-lead cp-center">\u4E0D\u7528\u6DF1\u5438\uFF0C\u4E0D\u8981\u618B\u6C14\uFF0C\u4E5F\u65E0\u9700\u8FFD\u8D76\u5706\u73AF\u3002</p>
      <div class="cp-breath-stage"><div class="cp-breath-halo" aria-hidden="true"></div><div class="cp-breath-ring" aria-hidden="true"></div>
        <div class="cp-breath-copy"><span class="cp-breath-label">\u6309\u4F60\u7684\u8282\u594F</span><span class="cp-clock" role="timer" aria-live="off" aria-label="\u5DF2\u7EC3\u4E60\u65F6\u95F4">0:00</span><span class="cp-hint">\u5171 2 \u5206\u949F</span></div></div>
      <p class="cp-timer-note" role="status" aria-live="polite"></p>
      <div class="cp-timer-actions">${button("clock-toggle", "\u5F00\u59CB\u8BA1\u65F6", "primary")}
        ${button("clock-end", "\u63D0\u524D\u7ED3\u675F", "secondary", "disabled")}</div>
      <p class="cp-hint cp-center">\u5207\u5230\u540E\u53F0\u6216\u7A97\u53E3\u5931\u7126\u4F1A\u81EA\u52A8\u6682\u505C\uFF0C\u56DE\u6765\u540E\u7531\u4F60\u624B\u52A8\u7EE7\u7EED\u3002\u4E0D\u6D4B\u91CF\u5FC3\u7387\u6216\u4EFB\u4F55\u8EAB\u4F53\u6307\u6807\u3002</p>
      <div class="cp-note"><strong>\u4E0D\u8212\u670D\u65F6\u5C31\u505C\u4E0B\u3002</strong>\u53EF\u4EE5\u7ACB\u5373\u9000\u51FA\uFF0C\u6216\u8F6C\u53BB\u770B\u5468\u56F4\u3002\u4E0D\u9700\u8981\u575A\u6301\u5230\u8BA1\u65F6\u7ED3\u675F\u3002</div>`;
    }
    function stepHTML() {
      prepareDraft();
      let title, description;
      if (current.id === "ground") {
        [title, description] = current.step < 3 ? GROUND[current.step] : ["\u9009\u4E00\u4E2A\u60F3\u56DE\u53BB\u505A\u7684\u5C0F\u52A8\u4F5C", "\u5FF5\u5934\u4ECD\u5728\u4E5F\u6CA1\u5173\u7CFB\u3002\u9009\u4E00\u4E2A\u773C\u524D\u80FD\u5F00\u59CB\u7684\u5C0F\u52A8\u4F5C\uFF0C\u6216\u5148\u4F11\u606F\u3002"];
      } else if (current.id === "settle") {
        title = "\u505C\u5728\u8FD9\u91CC\uFF0C\u518D\u9009\u4E00\u4E2A\u5C0F\u884C\u52A8\u3002";
        description = `\u8FD9\u6B21\u5B9E\u9645\u7EC3\u4E60\u4E86 ${formatTime(current.elapsed)}\u3002\u4E0D\u9700\u8981\u8BC4\u4EF7\u81EA\u5DF1\u662F\u5426\u201C\u505A\u597D\u201D\uFF0C\u4E5F\u4E0D\u5FC5\u8981\u6C42\u611F\u53D7\u53D1\u751F\u53D8\u5316\u3002`;
      } else {
        ({ title, description } = FLOWS[current.id][current.step]);
        if (current.id === "worry" && current.step === 2) {
          title = current.data.route === "act" ? "\u5B89\u6392\u4E00\u4E2A\u53EF\u6267\u884C\u7684\u4E0B\u4E00\u6B65" : "\u7559\u4E00\u4E2A 10\u201315 \u5206\u949F\u7684\u62C5\u5FE7\u65F6\u6BB5";
          description = current.data.route === "act" ? "\u628A\u201C\u89E3\u51B3\u5B83\u201D\u7F29\u5C0F\u4E3A\u4E00\u4E2A\u52A8\u4F5C\uFF0C\u5E76\u5199\u4E0B\u51C6\u5907\u5F00\u59CB\u7684\u65F6\u673A\u3002" : "\u7528\u81EA\u5DF1\u7684\u8BDD\u5199\u4E00\u4E2A\u65F6\u6BB5\u3002\u8FD9\u4E0D\u662F\u81EA\u52A8\u63D0\u9192\uFF0C\u4E0D\u4F1A\u8BBE\u7F6E\u901A\u77E5\u3002\u5230\u65F6\u53EF\u4EE5\u5199\u5199\u62C5\u5FE7\u3001\u770B\u770B\u6709\u6CA1\u6709\u65B0\u52A8\u4F5C\uFF1B\u73B0\u5728\u65E0\u9700\u628A\u5FF5\u5934\u8D76\u8D70\u3002";
        }
      }
      const groundStep = current.id === "ground" && current.step < 3;
      const draftStep = current.id === "boundary" && current.step === 4;
      return `<h2 class="cp-heading" tabindex="-1">${escape(title)}</h2><p class="cp-lead">${escape(description)}</p>
      ${groundStep ? `<div class="cp-ground-cue" aria-hidden="true"><span class="cp-ground-number">0${current.step + 1}</span><span>${["\u770B\u4E00\u770B", "\u611F\u53D7\u652F\u6491", "\u542C\u4E00\u542C"][current.step]}</span></div><p class="cp-hint">\u4E0D\u7528\u8FBE\u5230\u67D0\u79CD\u72B6\u6001\u3002\u6CE8\u610F\u529B\u8D70\u5F00\u540E\uFF0C\u4E5F\u53EF\u4EE5\u518D\u56DE\u6765\u3002</p>` : ""}
      ${draftStep && current.draftStale ? `<div class="cp-note cp-note--purple" role="status">\u524D\u9762\u7684\u5B89\u6392\u6216\u6C9F\u901A\u65B9\u5F0F\u6539\u8FC7\u4E86\uFF0C\u4F60\u5DF2\u7F16\u8F91\u7684\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002\u8BF7\u6838\u5BF9\u5B83\u662F\u5426\u9002\u5408\u73B0\u5728\u7684\u60C5\u51B5\u3002
        <div class="cp-inline-actions">${button("refresh-draft", "\u7528\u5F53\u524D\u4FE1\u606F\u91CD\u5199\u8349\u7A3F\uFF08\u66FF\u6362\u6B64\u6BB5\uFF09", "quiet")}</div></div>` : ""}
      <form class="cp-form" novalidate>${fieldsFor().map(fieldHTML).join("")}
        ${draftStep ? '<p class="cp-hint">\u8349\u7A3F\u672A\u53D1\u9001\u3002\u4F60\u53EF\u4EE5\u5148\u4FDD\u7559\u60F3\u6CD5\uFF0C\u4E0D\u5FC5\u8054\u7CFB\u4EFB\u4F55\u4EBA\u3002</p>' : ""}
        <div class="cp-step-actions">${button("back", current.step === 0 ? current.id === "settle" ? "\u8FD4\u56DE\u547C\u5438" : "\u8FD4\u56DE\u4ECB\u7ECD" : "\u4E0A\u4E00\u6B65", "quiet")}
          <button type="submit" class="cp-button cp-button--primary">${groundStep ? "\u6211\u7559\u610F\u8FC7\u4E86\uFF0C\u7EE7\u7EED" : current.step === stepCount() - 1 ? "\u67E5\u770B\u5E76\u786E\u8BA4" : "\u4E0B\u4E00\u6B65"}</button></div>
        ${groundStep ? `<div class="cp-skip">${button("skip-ground", "\u6B64\u523B\u4E0D\u65B9\u4FBF\uFF0C\u8DF3\u8FC7\u8FD9\u4E00\u9879", "quiet")}</div>` : ""}
      </form>`;
    }
    function reviewHTML() {
      return `<p class="cp-eyebrow">${current.isExample ? "\u793A\u4F8B\u884C\u52A8\u5361 \xB7 \u4E0D\u4EE3\u8868\u4F60\u7684\u4E2A\u4EBA\u8BB0\u5F55" : "\u6211\u7684\u884C\u52A8\u5361 \xB7 \u786E\u8BA4\u540E\u5B8C\u6210"}</p>
      <h2 class="cp-heading" tabindex="-1">\u770B\u770B\uFF0C\u8FD9\u662F\u5426\u7B26\u5408\u4F60\u7684\u610F\u601D\u3002</h2>
      <p class="cp-lead">\u53EF\u4EE5\u8FD4\u56DE\u4FEE\u6539\u3002\u786E\u8BA4\u4EC5\u8868\u793A\u5B8C\u6210\u8FD9\u6B21\u6574\u7406\uFF0C\u4E0D\u4EE3\u8868\u60C5\u7EEA\u6216\u8EAB\u4F53\u72B6\u51B5\u5DF2\u7ECF\u6539\u53D8\u3002</p>
      <dl class="cp-summary">${summary().map((row) => `<div class="cp-summary-row"><dt>${escape(row.label)}</dt><dd>${escape(row.value)}</dd></div>`).join("")}
        <div class="cp-summary-row cp-summary-row--next"><dt>\u63A5\u4E0B\u6765\u7684\u5C0F\u884C\u52A8</dt><dd>${escape(nextAction())}</dd></div></dl>
      ${current.id === "boundary" ? '<p class="cp-note">\u8FD9\u662F\u4E00\u4EFD\u672A\u53D1\u9001\u7684\u8349\u7A3F\u3002\u662F\u5426\u4F7F\u7528\u3001\u4F55\u65F6\u6C9F\u901A\uFF0C\u90FD\u7531\u4F60\u51B3\u5B9A\u3002</p>' : ""}
      <div class="cp-step-actions">${button("review-back", "\u8FD4\u56DE\u4FEE\u6539", "quiet")}${button("complete", current.isExample ? "\u786E\u8BA4\u5B8C\u6210\u793A\u4F8B\u4F53\u9A8C" : "\u786E\u8BA4\u5B8C\u6210\u8FD9\u6B21\u7EC3\u4E60", "primary")}</div>`;
    }
    function render2(focus = true) {
      if (disposed) return;
      root.setAttribute("aria-label", TITLES[current.id]);
      root.innerHTML = `<header class="cp-header"><div class="cp-title-group"><span class="cp-kicker">\u7ED9\u6B64\u523B\u4E00\u70B9\u7A7A\u95F4</span><p class="cp-practice-title">${escape(TITLES[current.id])}</p></div>
      <div class="cp-header-actions">${button("help", "\u9700\u8981\u652F\u6301", "quiet")}${button("exit", "\u9000\u51FA\u7EC3\u4E60", "quiet")}</div></header>
      ${history2.length ? `<div class="cp-return">${button("return-practice", `\u8FD4\u56DE\u300C${escape(TITLES[history2.at(-1).id])}\u300D\u7684\u8FDB\u5EA6`, "quiet")}</div>` : ""}
      ${current.isExample ? '<div class="cp-example-banner">\u6B63\u5728\u4F53\u9A8C\u804C\u573A\u4F8B\u5B50\u3002\u5373\u4F7F\u4FEE\u6539\u6587\u5B57\uFF0C\u5B8C\u6210\u7ED3\u679C\u4ECD\u6807\u8BB0\u4E3A\u793A\u4F8B\u3002</div>' : ""}
      ${helpOpen ? '<aside class="cp-note" role="status">\u53EF\u4EE5\u5148\u505C\u4E0B\uFF0C\u627E\u4E00\u4F4D\u53EF\u4FE1\u7684\u4EBA\u804A\u804A\u3002\u5982\u679C\u56F0\u6270\u6301\u7EED\u5F71\u54CD\u751F\u6D3B\uFF0C\u53EF\u4EE5\u8003\u8651\u5BFB\u6C42\u5408\u9002\u7684\u4E13\u4E1A\u652F\u6301\uFF1B\u5DE5\u4F5C\u4E2D\u7684\u8D1F\u62C5\u4E5F\u9700\u8981\u8D44\u6E90\u4E0E\u6761\u4EF6\u7684\u6539\u53D8\u3002</aside>' : ""}
      <div class="cp-content">${progressHTML()}${current.view === "intro" ? introHTML() : current.view === "clock" ? clockHTML() : current.view === "review" ? reviewHTML() : stepHTML()}</div>
      ${alternateHTML()}
      <footer class="cp-footer">\u8FD9\u662F\u4E00\u6B21\u7B80\u77ED\u7684\u81EA\u52A9\u7EC3\u4E60\uFF0C\u4E0D\u7528\u4E8E\u8BCA\u65AD\uFF0C\u4E5F\u4E0D\u7B49\u540C\u4E8E\u5B8C\u6574\u7684 CBT \u81EA\u52A9\u6216\u6CBB\u7597\u3002</footer>`;
      if (current.view === "clock") updateClock();
      if (focus) root.querySelector(".cp-heading")?.focus({ preventScroll: false });
    }
    function renderErrors() {
      render2(false);
      const key = Object.keys(current.errors)[0];
      const invalid = root.querySelector(`[data-cp-key="${key}"]`);
      invalid?.focus();
    }
    function updateClock() {
      if (disposed || current.id !== "settle" || current.view !== "clock") return;
      const elapsed = Math.min(12e4, current.elapsed + (startedAt === null ? 0 : Math.max(0, win.performance.now() - startedAt)));
      const clock = root.querySelector(".cp-clock");
      if (!clock) return;
      const text = formatTime(elapsed);
      if (clock.textContent !== text) clock.textContent = text;
      clock.setAttribute("aria-label", `\u5DF2\u7EC3\u4E60 ${text}\uFF0C\u5171\u4E24\u5206\u949F`);
      const ring = root.querySelector(".cp-breath-ring");
      const scale = reducedMotion?.matches ? 1 : 0.94 + 0.06 * (1 - Math.cos(elapsed / 8e3 * Math.PI * 2));
      ring.style.transform = `scale(${scale})`;
      const note = root.querySelector(".cp-timer-note");
      const noteText = current.timerStatus === "running" ? "\u6B63\u5728\u8BA1\u65F6\u3002\u5706\u73AF\u53EA\u4F9B\u53C2\u8003\uFF0C\u6309\u81EA\u5DF1\u8212\u670D\u7684\u8282\u594F\u547C\u5438\u3002" : current.timerNote || "\u51C6\u5907\u597D\u518D\u5F00\u59CB\u3002\u4E24\u5206\u949F\u53EA\u662F\u4E00\u4E2A\u53EF\u968F\u65F6\u7ED3\u675F\u7684\u9080\u8BF7\u3002";
      if (note.textContent !== noteText) note.textContent = noteText;
      const toggle = root.querySelector('[data-cp-action="clock-toggle"]');
      toggle.textContent = current.timerStatus === "running" ? "\u6682\u505C" : current.timerStatus === "paused" ? "\u7EE7\u7EED" : "\u5F00\u59CB\u8BA1\u65F6";
      root.querySelector('[data-cp-action="clock-end"]').disabled = elapsed <= 0;
    }
    function tick() {
      raf = null;
      if (disposed || current.timerStatus !== "running") return;
      if (doc.hidden || blurred) {
        pauseClock("\u9875\u9762\u4E0D\u5728\u524D\u53F0\uFF0C\u5DF2\u6682\u505C\u8BA1\u65F6\u3002\u56DE\u6765\u540E\u53EF\u624B\u52A8\u7EE7\u7EED\u3002");
        return;
      }
      const elapsed = current.elapsed + Math.max(0, win.performance.now() - startedAt);
      if (elapsed >= 12e4) {
        endClock();
        return;
      }
      updateClock();
      raf = win.requestAnimationFrame(tick);
    }
    function startClock() {
      if (doc.hidden || blurred) {
        current.timerNote = "\u8BF7\u56DE\u5230\u5F53\u524D\u7A97\u53E3\u540E\uFF0C\u518D\u9009\u62E9\u5F00\u59CB\u6216\u7EE7\u7EED\u3002";
        updateClock();
        return;
      }
      if (current.elapsed >= 12e4) {
        current.view = "step";
        render2();
        return;
      }
      current.timerStatus = "running";
      current.timerNote = "";
      timerOwner = current;
      startedAt = win.performance.now();
      updateClock();
      raf = win.requestAnimationFrame(tick);
    }
    function endClock() {
      stopClock();
      if (current.elapsed <= 0) return;
      current.timerStatus = "paused";
      current.timerNote = "\u5DF2\u7ED3\u675F\u672C\u6BB5\u547C\u5438\uFF1B\u5982\u679C\u9700\u8981\uFF0C\u4E5F\u53EF\u4EE5\u7EE7\u7EED\u5269\u4F59\u65F6\u95F4\u3002";
      current.view = "step";
      current.step = 0;
      render2();
    }
    function goNext(skipGround = false) {
      if (current.view !== "step") return;
      if (!validate()) {
        renderErrors();
        return;
      }
      if (current.id === "boundary" && current.step === 4 && current.draftStale) {
        current.draftSource = draftSource();
        current.draftStale = false;
      }
      if (current.id === "ground" && current.step < 3) current.data[`groundState${current.step}`] = skipGround ? "skipped" : "noticed";
      current.errors = {};
      if (current.step < stepCount() - 1) current.step += 1;
      else current.view = "review";
      render2();
    }
    function switchPractice(nextId) {
      pauseClock("\u5207\u6362\u4E86\u7EC3\u4E60\uFF0C\u547C\u5438\u8BA1\u65F6\u5DF2\u6682\u505C\u3002\u8FD4\u56DE\u540E\u53EF\u624B\u52A8\u7EE7\u7EED\u3002");
      history2.push(current);
      current = session(nextId, current.isExample);
      helpOpen = false;
      onPracticeChange?.(current.id);
      render2();
    }
    function handleInput(event) {
      if (disposed || finished) return;
      const input = event.target;
      const key = input.dataset?.cpKey;
      if (!key || !root.contains(input)) return;
      if (input.type === "radio" && !input.checked) return;
      current.data[key] = input.value;
      if (current.id === "boundary" && (["tasks", "request", "capacity", "strategy", "safety"].includes(key) || key === "draft" && current.draftStale)) {
        current.data.draftChecked = "";
        root.querySelectorAll('[data-cp-key="draftChecked"]').forEach((node) => {
          node.checked = false;
        });
      }
      if (current.errors[key]) {
        delete current.errors[key];
        const wrapper = input.closest("[data-cp-field]");
        wrapper?.removeAttribute("aria-invalid");
        wrapper?.querySelectorAll("[aria-invalid]").forEach((node) => node.removeAttribute("aria-invalid"));
        const error = wrapper?.querySelector(".cp-error");
        if (error) {
          error.textContent = "";
          error.hidden = true;
        }
      }
      if (input.type === "radio" && event.type === "change") {
        const value = input.value;
        render2(false);
        root.querySelector(`[data-cp-key="${key}"][value="${value}"]`)?.focus({ preventScroll: true });
      }
    }
    function handleSubmit(event) {
      event.preventDefault();
      if (!disposed && !finished) goNext();
    }
    function complete() {
      if (current.view !== "review" || finished) return;
      for (let i = 0; i < stepCount(); i += 1) {
        if (!validate(fieldsFor(i))) {
          current.step = i;
          current.view = "step";
          renderErrors();
          return;
        }
      }
      if (current.id === "settle" && current.elapsed <= 0) {
        current.view = "clock";
        render2();
        return;
      }
      if (current.id === "ground") {
        const missing = [0, 1, 2].find((i) => !current.data[`groundState${i}`]);
        if (missing !== void 0) {
          current.step = missing;
          current.view = "step";
          render2();
          return;
        }
      }
      const payload = { id: current.id, title: TITLES[current.id], summary: summary(), nextAction: nextAction(), isExample: current.isExample };
      finished = true;
      cleanup2();
      onComplete?.(payload);
    }
    function handleClick(event) {
      if (disposed || finished) return;
      const target = event.target.closest?.("[data-cp-action]");
      if (!target || !root.contains(target) || target.disabled) return;
      switch (target.dataset.cpAction) {
        case "exit":
          pauseClock("\u5DF2\u6682\u505C\u3002\u82E5\u9009\u62E9\u7559\u5728\u8FD9\u91CC\uFF0C\u51C6\u5907\u597D\u540E\u518D\u6309\u201C\u7EE7\u7EED\u201D\u3002");
          if (typeof onExit === "function") onExit();
          else cleanup2();
          break;
        case "help":
          pauseClock("\u5DF2\u6682\u505C\uFF0C\u4F60\u53EF\u4EE5\u5148\u770B\u770B\u652F\u6301\u65B9\u5F0F\u3002");
          if (typeof onHelp === "function") onHelp();
          else {
            helpOpen = !helpOpen;
            render2(false);
          }
          break;
        case "start":
          current.view = current.id === "settle" ? "clock" : "step";
          current.step = 0;
          render2();
          break;
        case "example":
          history2.push(current);
          current = session(current.id, true);
          current.view = "step";
          render2();
          break;
        case "return-practice":
          if (history2.length) {
            pauseClock();
            current = history2.pop();
            onPracticeChange?.(current.id);
            render2();
          }
          break;
        case "back":
          current.errors = {};
          if (current.step > 0) current.step -= 1;
          else current.view = current.id === "settle" ? "clock" : "intro";
          render2();
          break;
        case "review-back":
          current.step = stepCount() - 1;
          current.view = "step";
          render2();
          break;
        case "complete":
          complete();
          break;
        case "skip-ground":
          goNext(true);
          break;
        case "clock-toggle":
          current.timerStatus === "running" ? pauseClock() : startClock();
          break;
        case "clock-end":
          endClock();
          break;
        case "switch-ground":
          switchPractice("ground");
          break;
        case "switch-boundary":
          switchPractice("boundary");
          break;
        case "refresh-draft":
          current.data.draft = makeDraft();
          current.generatedDraft = current.data.draft;
          current.draftSource = draftSource();
          current.draftStale = false;
          current.data.draftChecked = "";
          delete current.errors.draftChecked;
          render2();
          break;
        default:
          break;
      }
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleInput);
    root.addEventListener("submit", handleSubmit);
    container.addEventListener("songjian:pause", onHostPause);
    doc.addEventListener("visibilitychange", onVisibility);
    win.addEventListener("blur", onBlur);
    win.addEventListener("focus", onFocus);
    win.addEventListener("pagehide", onPageHide);
    reducedMotion?.addEventListener?.("change", onMotionChange);
    render2();
    return cleanup2;
  }

  // dist/src/care-app.js
  var main = document.querySelector("#main");
  var helpDialog = document.querySelector("#care-help-dialog");
  var leaveDialog = document.querySelector("#care-leave-dialog");
  var state = { records: [], last: null };
  var cleanup = () => {
  };
  var activePractice = false;
  var pendingRoute = null;
  var currentRoute = "";
  var toastTimer;
  var sourceLinks = (ids) => ids.map((id) => `<a href="${sources[id].url}" target="_blank" rel="noopener noreferrer">${escapeHTML(sources[id].name)} \u2197</a>`).join("");
  var actionButton = (text, route, secondary = false) => `<a class="care-button ${secondary ? "secondary" : ""}" href="#${route}">${text}${icon("arrow")}</a>`;
  var motif = (kind) => `<div class="care-motif ${kind === "body" ? "rings" : kind === "mind" ? "curves" : "steps"}" aria-hidden="true"><i></i><i></i><i></i><b></b></div>`;
  var saved = () => personalRecords(state.records);
  var practiceEvidence = (method) => `<summary>\u8FD9\u4E2A\u7EC3\u4E60\u7684\u4F9D\u636E\u4E0E\u8FB9\u754C</summary><p>${method.evidence}</p><p>${method.limit}</p><div class="care-source-links">${sourceLinks(method.sources)}</div>`;
  function updatePracticeContext(id) {
    const method = methodById(id);
    if (!method) return;
    currentRoute = "practice/" + id;
    history.replaceState(null, "", "#" + currentRoute);
    document.querySelector(".care-practice-header > span").textContent = `${method.label} / ${method.short}`;
    document.querySelector("#care-practice-mount").setAttribute("aria-label", method.short);
    document.querySelector(".care-practice-evidence").innerHTML = practiceEvidence(method);
    document.title = `${method.short} \xB7 Relaxs`;
  }
  function home() {
    return `<section class="care-welcome" aria-labelledby="welcome-title">
    <div class="care-still-life" aria-hidden="true"><span class="care-water-ring"></span><span class="care-water-ring second"></span><span class="care-pebble"></span><span class="care-pebble-shadow"></span></div>
    <div class="care-welcome-copy"><span class="care-eyebrow">A LITTLE PAUSE</span><h1 id="welcome-title">\u7ED9\u81EA\u5DF1\uFF0C\u7559\u70B9\u7A7A\u767D\u3002</h1><p>\u4E0D\u6025\u7740\u89E3\u51B3\u4EC0\u4E48\u3002\u5148\u6309\u81EA\u5DF1\u7684\u65B9\u5F0F\uFF0C\u6B47\u4E00\u4F1A\u513F\u3002</p></div>
    <div class="care-entry-pair">
      <a class="care-entry care-entry-calm" href="#practice/settle"><span class="care-entry-icon">${icon("wind")}</span><span><strong>\u6162\u4E0B\u6765</strong><small>\u7559\u610F\u547C\u5438\uFF0C\u505C\u4E00\u5C0F\u4F1A\u513F</small></span>${icon("arrow")}</a>
      <a class="care-entry care-entry-play" href="./hoops.html"><span class="care-entry-icon">${icon("ball")}</span><span><strong>\u73A9\u4E00\u4F1A</strong><small>\u53BB\u843D\u65E5\u7403\u573A\uFF0C\u968F\u624B\u6295\u51E0\u7403</small></span>${icon("arrow")}</a>
    </div>
    <a class="care-organize-link" href="#organize">\u6709\u4EF6\u4E8B\u653E\u4E0D\u4E0B\uFF1F<span>\u7406\u4E00\u7406 ${icon("arrow")}</span></a>
  </section>`;
  }
  function collection(kind) {
    const calm2 = kind === "calm";
    const list = methods.filter((method) => calm2 ? method.group === "body" : method.group !== "body");
    return `<section class="care-collection"><a class="care-text-button care-back-link" href="#home">${icon("back")}\u9996\u9875</a>
    <div class="care-collection-intro"><span class="care-eyebrow">${calm2 ? "A QUIETER MOMENT" : "ONE THING AT A TIME"}</span><h1>${calm2 ? "\u9009\u4E00\u79CD\u8212\u670D\u7684\u65B9\u5F0F\u3002" : "\u53EA\u7406\u773C\u524D\u8FD9\u4E00\u4EF6\u3002"}</h1><p>${calm2 ? "\u7559\u610F\u547C\u5438\uFF0C\u6216\u770B\u770B\u8EAB\u8FB9\u3002\u6309\u4F60\u7684\u8282\u594F\u6765\u3002" : "\u4ECE\u6700\u8D34\u8FD1\u4F60\u7684\u90A3\u4E00\u9879\u5F00\u59CB\uFF0C\u6162\u6162\u7406\u6E05\u3002"}</p></div>
    <div class="care-choice-list">${list.map((method) => `<a class="care-choice" href="#practice/${method.id}"><span class="care-choice-icon">${icon(method.icon)}</span><span class="care-choice-copy"><strong>${method.title}</strong><small>${method.intro}</small></span><span class="care-choice-time">${method.time}</span>${icon("arrow")}</a>`).join("")}</div>
    <p class="care-collection-note">${calm2 ? '\u60F3\u6362\u79CD\u5FC3\u60C5\uFF1F<a href="./hoops.html">\u53BB\u6295\u51E0\u7403 \u2197</a>' : '\u4E5F\u53EF\u4EE5\u6682\u65F6\u653E\u4E0B\uFF0C<a href="#calm">\u5148\u6B47\u4E00\u4F1A\u513F \u2197</a>'}</p>
  </section>`;
  }
  var calm = () => collection("calm");
  var organize = () => collection("organize");
  function evidence() {
    return `<section class="care-page-intro"><span class="care-eyebrow">METHODS, WITH CONTEXT</span><h1>\u6BCF\u4E2A\u65B9\u6CD5\uFF0C\u90FD\u8BF4\u6E05\u4F9D\u636E\u3002</h1><p>\u65B9\u6CD5\u672C\u8EAB\u6709\u7814\u7A76\uFF0C\u4E0D\u4EE3\u8868\u6211\u4EEC\u7684\u51E0\u5206\u949F\u4EA4\u4E92\u5DF2\u88AB\u9A8C\u8BC1\u6709\u6548\u3002<br>\u8FD9\u4E9B\u662F\u53C2\u8003\u4E13\u4E1A\u8D44\u6599\u8BBE\u8BA1\u7684\u65E5\u5E38\u81EA\u52A9\u7EC3\u4E60\uFF0C\u4F60\u53EF\u4EE5\u9009\u62E9\u3001\u505C\u6B62\u6216\u5BFB\u6C42\u5E2E\u52A9\u3002</p></section><div class="care-evidence-principles"><article><b>01</b><h2>\u6280\u80FD\uFF0C\u4E0D\u662F\u4E00\u6B21\u7597\u7A0B</h2><p>NICE \u63A8\u8350\u7684 CBT \u81EA\u52A9\u6709\u7ED3\u6784\u548C\u6301\u7EED\u7EC3\u4E60\u8981\u6C42\u3002\u77ED\u7EC3\u4E60\u4E0D\u7B49\u540C\u4E8E\u5B8C\u6574 CBT\uFF0C\u4E5F\u4E0D\u4FDD\u8BC1\u4EBA\u4EBA\u6709\u6548\u3002</p>${sourceLinks(["nice"])}</article><article><b>02</b><h2>\u5F53\u4E0B\u611F\u53D7\uFF0C\u4E0D\u662F\u8BCA\u65AD</h2><p>\u8FD9\u91CC\u4E0D\u4ECE\u6E38\u620F\u3001\u53CD\u5E94\u901F\u5EA6\u6216\u70B9\u51FB\u884C\u4E3A\u63A8\u65AD\u7126\u8651\u7A0B\u5EA6\u3002\u4E0D\u586B\u5199\u91CF\u8868\uFF0C\u4E5F\u53EF\u4EE5\u4F7F\u7528\u5168\u90E8\u7EC3\u4E60\u3002</p></article><article><b>03</b><h2>\u4E5F\u8981\u6539\u53D8\u538B\u529B\u6765\u6E90</h2><p>\u5DE5\u4F5C\u91CF\u3001\u53EF\u63A7\u6027\u4E0E\u652F\u6301\u540C\u6837\u91CD\u8981\u3002\u6211\u4EEC\u63D0\u4F9B\u95EE\u9898\u89E3\u51B3\u4E0E\u534F\u5546\u5DE5\u5177\uFF0C\u4E0D\u80FD\u4EE3\u66FF\u7EC4\u7EC7\u6539\u5584\u5DE5\u4F5C\u6761\u4EF6\u3002</p>${sourceLinks(["work"])}</article></div>
  <div class="care-evidence-list">${methods.map((method) => `<article><div class="care-evidence-heading"><span class="care-tile-icon">${icon(method.icon)}</span><div><span class="care-eyebrow">${method.label}</span><h2>${method.short}</h2></div>${actionButton("\u4F53\u9A8C", "practice/" + method.id, true)}</div><p>${method.evidence}</p><dl><div><dt>\u4EC0\u4E48\u65F6\u5019\u53EF\u4EE5\u8BD5</dt><dd>${method.fit}</dd></div><div><dt>\u9700\u8981\u7559\u610F</dt><dd>${method.limit}</dd></div></dl><div class="care-source-links">${sourceLinks(method.sources)}</div></article>`).join("")}</div>
  <section class="care-recovery"><span class="care-eyebrow">OUTSIDE THE SCREEN</span><h2>\u4E5F\u7ED9\u5C4F\u5E55\u4E4B\u5916\u7684\u6062\u590D\u7559\u4F4D\u7F6E\u3002</h2><div><article>${icon("sun")}<h3>\u9009\u4E00\u79CD\u5408\u9002\u7684\u771F\u5B9E\u6D3B\u52A8</h3><p>\u6563\u6B65\u3001\u9A91\u8F66\u6216\u5176\u4ED6\u4F60\u80FD\u63A5\u53D7\u7684\u6D3B\u52A8\u3002\u5148\u4ECE\u81EA\u5DF1\u7684\u8EAB\u4F53\u6761\u4EF6\u548C\u53EF\u7528\u65F6\u95F4\u51FA\u53D1\uFF1B\u5C4F\u5E55\u91CC\u7684\u8FD0\u52A8\u6E38\u620F\u4E0D\u7B49\u540C\u4E8E\u8EAB\u4F53\u6D3B\u52A8\u3002</p>${sourceLinks(["move"])}</article><article>${icon("moon")}<h3>\u7ED9\u4E0B\u73ED\u4E0E\u7761\u7720\u7559\u8FB9\u754C</h3><p>\u53EF\u4EE5\u8BD5\u7740\u5B89\u6392\u4E00\u4E2A\u505C\u6B62\u5904\u7406\u5DE5\u4F5C\u7684\u65F6\u95F4\u3002\u6301\u7EED\u5931\u7720\u65F6\u5BFB\u6C42\u8BC4\u4F30\uFF1B\u4E00\u5F20\u7761\u7720\u63D0\u793A\u5361\u4E0D\u7B49\u540C\u4E8E\u5B8C\u6574\u5931\u7720\u6CBB\u7597\u3002</p>${sourceLinks(["sleep"])}</article></div></section>`;
  }
  function summaryMarkup(record) {
    return `<dl class="care-record-summary">${record.summary.map((item) => `<div><dt>${escapeHTML(item.label)}</dt><dd>${escapeHTML(item.value)}</dd></div>`).join("")}</dl><div class="care-next-action"><span>${icon("steps")}\u6211\u613F\u610F\u5E26\u8D70\u7684\u4E0B\u4E00\u6B65</span><p>${escapeHTML(record.nextAction)}</p></div>`;
  }
  var feedbackLabels = { better: "\u66F4\u80FD\u7EE7\u7EED\u4E86", same: "\u6CA1\u6709\u660E\u663E\u53D8\u5316", worse: "\u66F4\u96BE\u53D7\u4E86", unsure: "\u6682\u65F6\u8BF4\u4E0D\u4E0A" };
  function result() {
    const record = state.last;
    if (!record) return notes();
    const feedback = feedbackFor(record.feedback);
    return `<section class="care-result care-quiet-result"><span class="care-eyebrow">${record.isExample ? "EXAMPLE / \u793A\u4F8B\u4F53\u9A8C" : "A MOMENT FOR YOURSELF"}</span><h1>${record.isExample ? "\u8FD9\u4E2A\u4F8B\u5B50\uFF0C\u8D70\u5230\u8FD9\u91CC\u3002" : "\u8FD9\u4E00\u523B\uFF0C\u5148\u5230\u8FD9\u91CC\u3002"}</h1><p>${record.isExample ? "\u6F14\u793A\u5185\u5BB9\u4E0D\u4F1A\u8BA1\u5165\u4F60\u7684\u672C\u6B21\u8BB0\u5F55\u3002" : "\u53EF\u4EE5\u79BB\u5F00\uFF0C\u4E5F\u53EF\u4EE5\u518D\u5F85\u4E00\u4F1A\u513F\u3002"}</p>
  <div class="care-result-actions">${actionButton(record.isExample ? "\u7528\u81EA\u5DF1\u7684\u60C5\u51B5\u8BD5\u8BD5" : "\u56DE\u5230\u9996\u9875", record.isExample ? "practice/" + record.id : "home")}</div>
  <details class="care-result-detail"><summary>${record.isExample ? "\u56DE\u770B\u8FD9\u4E2A\u4F8B\u5B50" : "\u770B\u770B\u8FD9\u6B21\u7559\u4E0B\u7684\u5185\u5BB9"}</summary><article class="care-record"><h2>${escapeHTML(record.title)}</h2>${summaryMarkup(record)}</article>${record.isExample ? "" : '<button class="care-text-button" data-download>\u4E0B\u8F7D\u8FD9\u5F20\u884C\u52A8\u5361 \u2193</button>'}<p class="care-small-note">\u5185\u5BB9\u53EA\u7559\u5728\u5F53\u524D\u9875\u9762\uFF0C\u5237\u65B0\u6216\u5173\u95ED\u540E\u6E05\u7A7A\u3002</p></details>
  ${record.isExample ? "" : `<details class="care-result-detail" ${record.feedback ? "open" : ""}><summary>\u6B64\u523B\u611F\u89C9\u600E\u4E48\u6837\uFF1F<span>\u9009\u586B</span></summary><section class="care-feedback"><div role="group" aria-label="\u6B64\u523B\u7684\u4F53\u9A8C\u53CD\u9988">${Object.entries(feedbackLabels).map(([id, label]) => `<button data-feedback="${id}" aria-pressed="${record.feedback === id}">${label}</button>`).join("")}</div>${feedback ? `<div class="care-feedback-response ${feedback.offerSupport ? "support" : ""}" role="status"><h3>${feedback.title}</h3><p>${feedback.text}</p>${feedback.offerSupport ? '<button class="care-button secondary" data-help>\u67E5\u770B\u652F\u6301\u65B9\u5F0F \u2197</button>' : ""}</div>` : ""}</section></details>`}</section>`;
  }
  function notes() {
    const records = saved();
    return `<section class="care-page-intro"><span class="care-eyebrow">TAKE SOMETHING WITH YOU</span><h1>\u7559\u4E0B\u7684\uFF0C\u662F\u53EF\u4EE5\u8D70\u7684\u4E0B\u4E00\u6B65\u3002</h1><p>\u8FD9\u91CC\u4FDD\u7559\u672C\u6B21\u9875\u9762\u91CC\u7684\u884C\u52A8\u5361\u3002\u6CA1\u6709\u6253\u5361\u538B\u529B\uFF0C\u4E5F\u4E0D\u6309\u6570\u91CF\u5224\u65AD\u4F60\u662F\u5426\u53D8\u597D\u4E86\u3002</p></section>${records.length ? `<div class="care-notes">${records.slice().reverse().map((record) => `<article class="care-record"><span class="care-eyebrow">\u672C\u6B21\u7EC3\u4E60</span><h2>${escapeHTML(record.title)}</h2>${summaryMarkup(record)}${record.feedback ? `<p class="care-saved-feedback">\u6B64\u523B\u53CD\u9988\uFF1A${feedbackLabels[record.feedback]}</p>` : ""}<button class="care-text-button" data-download-record="${state.records.indexOf(record)}">\u4E0B\u8F7D\u5230\u81EA\u5DF1\u7684\u8BBE\u5907 ${icon("download")}</button></article>`).join("")}</div>` : `<section class="care-empty">${motif("work")}<h2>\u8FD8\u6CA1\u6709\u7559\u4E0B\u884C\u52A8\u5361\u3002</h2><p>\u5982\u679C\u613F\u610F\uFF0C\u4ECE\u4E00\u4EF6\u5177\u4F53\u7684\u5C0F\u4E8B\u5F00\u59CB\u3002</p>${actionButton("\u9009\u62E9\u4E00\u4E2A\u7EC3\u4E60", "home")}</section>`}<p class="care-small-note">\u672C\u5DE5\u5177\u4E0D\u5411\u540E\u53F0\u4FDD\u5B58\u7EC3\u4E60\u8F93\u5165\u3002\u5237\u65B0\u6216\u5173\u95ED\u9875\u9762\u4F1A\u6E05\u7A7A\uFF1B\u793A\u4F8B\u4F53\u9A8C\u4E0D\u4F1A\u6DF7\u5165\u4E2A\u4EBA\u8BB0\u5F55\u3002</p>`;
  }
  function openHelp() {
    if (helpDialog.open) return;
    helpDialog.innerHTML = `<button class="care-dialog-close" data-close-help aria-label="\u5173\u95ED\u652F\u6301\u4FE1\u606F">${icon("close")}</button><span class="care-eyebrow">SUPPORT IS PART OF THE PLAN</span><h1 id="care-help-title">\u4E0D\u5FC5\u81EA\u5DF1\u625B\u5B8C\u3002</h1><p>\u5982\u679C\u6301\u7EED\u5F71\u54CD\u7761\u7720\u3001\u5DE5\u4F5C\u6216\u5173\u7CFB\uFF0C\u6216\u81EA\u52A9\u4ECD\u96BE\u4EE5\u5E94\u5BF9\uFF0C\u53EF\u4EE5\u8054\u7CFB\u6709\u8D44\u8D28\u7684\u5FC3\u7406\u4E13\u4E1A\u4EBA\u5458\uFF0C\u6216\u533B\u9662\u5FC3\u7406\u79D1\u3001\u7CBE\u795E\u79D1\u3001\u5168\u79D1\u533B\u751F\u3002\u65E0\u9700\u7B49\u5230\u67D0\u4E2A\u5206\u6570\u624D\u6C42\u52A9\u3002</p><div class="care-help-options"><article><h2>\u5148\u8054\u7CFB\u4E00\u4E2A\u53EF\u4FE1\u7684\u4EBA</h2><p>\u53EF\u4EE5\u8FD9\u6837\u5F00\u59CB\uFF1A\u201C\u6211\u6700\u8FD1\u6709\u70B9\u6491\u4E0D\u4F4F\uFF0C\u60F3\u8BF7\u4F60\u542C\u6211\u8BF4\u4E00\u4F1A\u513F\uFF0F\u966A\u6211\u627E\u4E00\u4E0B\u652F\u6301\u3002\u201D</p></article><article><h2>\u5DE5\u4F5C\u4E2D\u7684\u652F\u6301</h2><p>\u53EF\u4EE5\u8003\u8651\u53EF\u4FE1\u7684\u540C\u4E8B\u3001\u5408\u9002\u7684\u7BA1\u7406\u8005\u6216\u5458\u5DE5\u63F4\u52A9\u8BA1\u5212\u3002\u5148\u786E\u8BA4\u662F\u5426\u5B89\u5168\u3001\u662F\u5426\u4FDD\u5BC6\uFF0C\u518D\u51B3\u5B9A\u5206\u4EAB\u4EC0\u4E48\u3002</p></article><article><h2>\u4E2D\u56FD\u5927\u9646\u5FC3\u7406\u63F4\u52A9\u70ED\u7EBF</h2><strong class="care-hotline">12356</strong><p>\u5176\u4ED6\u5730\u533A\u8BF7\u8054\u7CFB\u5F53\u5730\u5FC3\u7406\u652F\u6301\u670D\u52A1\uFF1B\u5404\u5730\u63A5\u542C\u5B89\u6392\u53EF\u80FD\u4E0D\u540C\u3002</p><a href="https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml" target="_blank" rel="noopener noreferrer">\u67E5\u770B\u70ED\u7EBF\u6765\u6E90 \u2197</a></article></div><div class="care-urgent"><h2>\u5982\u679C\u773C\u4E0B\u5B58\u5728\u7D27\u6025\u5371\u9669</h2><p>\u5982\u6709\u5373\u523B\u4F24\u5BB3\u81EA\u5DF1\u7684\u98CE\u9669\uFF0C\u6216\u65B0\u53D1\u4E25\u91CD\u80F8\u75DB\u3001\u547C\u5438\u56F0\u96BE\u7B49\uFF0C\u8BF7\u8054\u7CFB\u5F53\u5730\u6025\u6551\u6216\u524D\u5F80\u6025\u8BCA\uFF0C\u5E76\u5C3D\u91CF\u8BA9\u53EF\u4FE1\u7684\u4EBA\u966A\u4F34\u3002\u4E2D\u56FD\u5927\u9646\u53EF\u62E8 120\uFF1B\u4EBA\u8EAB\u5B89\u5168\u7D27\u6025\u60C5\u51B5\u53EF\u62E8 110\u3002\u4E0D\u8981\u7B49\u5F85\u7F51\u9875\u7EC3\u4E60\u6216\u70ED\u7EBF\u6765\u66FF\u4EE3\u6025\u6551\u3002</p></div><p class="care-small-note">\u6B64\u9875\u9762\u4E0D\u63D0\u4F9B\u8BCA\u65AD\u3001\u5904\u65B9\u6216\u7D27\u6025\u6551\u63F4\u3002</p>`;
    document.querySelector("#care-practice-mount")?.dispatchEvent(new Event("songjian:pause"));
    helpDialog.showModal();
  }
  function showToast(text) {
    const el = document.querySelector("#care-toast");
    clearTimeout(toastTimer);
    el.textContent = text;
    el.classList.add("visible");
    toastTimer = setTimeout(() => el.classList.remove("visible"), 3e3);
  }
  function download(record) {
    if (!record || record.isExample) return;
    const text = `Relaxs \xB7 ${record.title}

${record.summary.map((item) => `${item.label}
${item.value}`).join("\n\n")}

\u6211\u613F\u610F\u5E26\u8D70\u7684\u4E0B\u4E00\u6B65
${record.nextAction}

\u8FD9\u662F\u4E00\u5F20\u4E2A\u4EBA\u884C\u52A8\u5361\uFF0C\u4E0D\u662F\u5FC3\u7406\u8BCA\u65AD\u6216\u7597\u6548\u62A5\u544A\u3002
`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Relaxs-\u6211\u7684\u4E0B\u4E00\u6B65.txt";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function navigate(route) {
    if (activePractice && route === currentRoute) return;
    if (activePractice && route !== currentRoute) {
      pendingRoute = route;
      document.querySelector("#care-practice-mount")?.dispatchEvent(new Event("songjian:pause"));
      leaveDialog.innerHTML = '<h2 id="care-leave-title">\u5148\u79BB\u5F00\u8FD9\u4E2A\u7EC3\u4E60\u5417\uFF1F</h2><p>\u8FD9\u6B21\u7EC3\u4E60\u8FD8\u6CA1\u7ED3\u675F\u3002\u79BB\u5F00\u540E\uFF0C\u5176\u4E2D\u7684\u8F93\u5165\u4E0D\u4F1A\u4FDD\u7559\u3002</p><div class="care-result-actions"><button class="care-button" data-stay>\u7EE7\u7EED\u7EC3\u4E60</button><button class="care-button secondary" data-leave>\u7ED3\u675F\u5E76\u79BB\u5F00</button></div>';
      if (!leaveDialog.open) leaveDialog.showModal();
      return;
    }
    if (location.hash === "#" + route) render(route);
    else location.hash = route;
  }
  function render(requested = location.hash.slice(1)) {
    let route = requested || "home";
    if (!["home", "calm", "organize", "evidence", "notes", "result"].includes(route) && !route.startsWith("practice/")) route = "home";
    cleanup();
    cleanup = () => {
    };
    activePractice = false;
    currentRoute = route;
    if (document.body) document.body.dataset.screen = route.startsWith("practice/") ? "practice" : route;
    document.querySelectorAll(".care-menu").forEach((menu) => menu.open = false);
    document.querySelectorAll(".care-header nav a").forEach((link) => link.hash === "#" + route ? link.setAttribute("aria-current", "page") : link.removeAttribute("aria-current"));
    if (route.startsWith("practice/")) {
      const method = methodById(route.split("/")[1]);
      if (!method) {
        navigate("home");
        return;
      }
      main.innerHTML = `<div class="care-practice-header"><button class="care-text-button" data-back>${icon("back")}\u6362\u4E00\u79CD</button><span>${method.short}</span><button class="care-text-button" data-help>\u9700\u8981\u652F\u6301 \u2197</button></div><section id="care-practice-mount" aria-label="${method.short}"></section><details class="care-practice-evidence">${practiceEvidence(method)}</details>`;
      activePractice = true;
      try {
        cleanup = mountPractice(method.id, document.querySelector("#care-practice-mount"), {
          onComplete(payload) {
            const record = makeCareRecord(payload);
            if (!record) {
              showToast("\u8FD8\u9700\u8981\u4E00\u4E2A\u5177\u4F53\u7684\u4E0B\u4E00\u6B65\uFF0C\u518D\u8BD5\u4E00\u6B21\u3002");
              return;
            }
            state.last = record;
            if (!record.isExample) state.records.push(record);
            activePractice = false;
            navigate("result");
          },
          onExit: () => navigate("home"),
          onHelp: openHelp,
          onPracticeChange: updatePracticeContext
        });
      } catch (error) {
        activePractice = false;
        main.innerHTML = '<section class="care-empty"><h1>\u8FD9\u4E2A\u7EC3\u4E60\u6682\u65F6\u6CA1\u80FD\u6253\u5F00\u3002</h1><p>\u53EF\u4EE5\u56DE\u5230\u9996\u9875\u518D\u8BD5\uFF0C\u6216\u8054\u7CFB\u652F\u6301\u3002</p><a class="care-button" href="#home">\u56DE\u5230\u6B64\u523B</a></section>';
        console.error(error);
      }
    } else main.innerHTML = { home, calm, organize, evidence, notes, result }[route]();
    document.title = `${route === "evidence" ? "\u65B9\u6CD5\u4E0E\u4F9D\u636E" : route === "notes" ? "\u672C\u6B21\u8BB0\u5F55" : route === "organize" ? "\u7406\u4E00\u4EF6\u4E8B" : route === "calm" ? "\u6162\u4E0B\u6765" : route.startsWith("practice/") ? methodById(route.split("/")[1])?.short : "\u7ED9\u81EA\u5DF1\u7559\u70B9\u7A7A\u767D"} \xB7 Relaxs`;
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link) {
      event.preventDefault();
      if (link.classList.contains("care-skip")) {
        main.focus({ preventScroll: true });
        main.scrollIntoView();
        return;
      }
      navigate(link.hash.slice(1));
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-help")) {
      document.querySelectorAll(".care-menu").forEach((menu) => menu.open = false);
      openHelp();
    }
    if (button.hasAttribute("data-close-help")) helpDialog.close();
    if (button.hasAttribute("data-back")) navigate(methodById(currentRoute.split("/")[1])?.group === "body" ? "calm" : "organize");
    if (button.hasAttribute("data-stay")) {
      pendingRoute = null;
      leaveDialog.close();
    }
    if (button.hasAttribute("data-leave")) {
      const route = pendingRoute;
      pendingRoute = null;
      activePractice = false;
      leaveDialog.close();
      navigate(route || "home");
    }
    if (button.dataset.feedback && state.last && !state.last.isExample && feedbackFor(button.dataset.feedback)) {
      const y = window.scrollY;
      state.last.feedback = button.dataset.feedback;
      render("result");
      window.scrollTo(0, y);
      main.querySelector(`[data-feedback="${state.last.feedback}"]`)?.focus({ preventScroll: true });
    }
    if (button.hasAttribute("data-download")) download(state.last);
    if (button.hasAttribute("data-download-record")) download(state.records[Number(button.dataset.downloadRecord)]);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelectorAll(".care-menu[open]").forEach((menu) => {
      menu.open = false;
      menu.querySelector("summary")?.focus();
    });
  });
  window.addEventListener("hashchange", () => {
    const requested = location.hash.slice(1);
    if (activePractice) {
      if (requested === currentRoute) return;
      history.replaceState(null, "", "#" + currentRoute);
      navigate(requested);
      return;
    }
    render();
  });
  leaveDialog.addEventListener("cancel", () => {
    pendingRoute = null;
  });
  window.addEventListener("pagehide", () => {
    cleanup();
    activePractice = false;
    clearTimeout(toastTimer);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) render();
  });
  render();
})();
