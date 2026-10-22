/* =====================================================
   PromptVault · 提示词资产库
   纯前端实现：localStorage 持久化 / 变量运行器 / 版本历史
   / URL 分享导入 / JSON 导入导出。零依赖、零后端、数据不出浏览器。
   ===================================================== */
(function () {
  "use strict";

  var STORE_KEY = "promptvault.v1";

  /* ---------- 状态 ---------- */
  var state = {
    items: [],              // 资产列表
    filterCategory: "全部",
    filterTag: null,
    keyword: ""
  };

  var editingId = null;     // 当前编辑的资产 id
  var runningId = null;     // 当前运行的资产 id
  var historyId = null;     // 当前查看版本的资产 id

  /* ---------- 工具函数 ---------- */
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function uid() {
    return "pv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function now() { return Date.now(); }
  function fmtTime(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getVars(body) {
    var seen = [], m, re = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;
    while ((m = re.exec(body))) { if (seen.indexOf(m[1]) < 0) seen.push(m[1]); }
    return seen;
  }
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(okMsg || "已复制"); }
      catch (e) { toast("复制失败，请手动复制"); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || "已复制"); }, fallback);
    } else { fallback(); }
  }

  /* ---------- 存取 ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      state.items = raw ? JSON.parse(raw) : [];
    } catch (e) { state.items = []; }
    if (!Array.isArray(state.items)) state.items = [];
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.items));
    } catch (e) { toast("保存失败：浏览器存储空间不足"); }
  }

  /* ---------- 派生数据 ---------- */
  function categories() {
    var map = {};
    state.items.forEach(function (it) { map[it.category] = (map[it.category] || 0) + 1; });
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
  }
  function allTags() {
    var map = {};
    state.items.forEach(function (it) { (it.tags || []).forEach(function (t) { map[t] = (map[t] || 0) + 1; }); });
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 24);
  }
  function visibleItems() {
    var kw = state.keyword.trim().toLowerCase();
    return state.items.filter(function (it) {
      if (state.filterCategory !== "全部" && it.category !== state.filterCategory) return false;
      if (state.filterTag && (it.tags || []).indexOf(state.filterTag) < 0) return false;
      if (kw) {
        var hay = (it.name + " " + it.body + " " + (it.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  /* ---------- 渲染 ---------- */
  function renderAll() {
    renderSidebar();
    renderCards();
    renderStats();
  }

  function renderSidebar() {
    var cats = ["全部"].concat(categories());
    $("#categoryList").innerHTML = cats.map(function (c) {
      var n = c === "全部" ? state.items.length : state.items.filter(function (i) { return i.category === c; }).length;
      return '<li class="' + (state.filterCategory === c && !state.filterTag ? "active" : "") + '" data-cat="' + escapeHtml(c) + '">' +
        '<span>' + escapeHtml(c) + '</span><span class="count">' + n + "</span></li>";
    }).join("");
    $all("#categoryList li").forEach(function (li) {
      li.onclick = function () {
        state.filterCategory = li.getAttribute("data-cat");
        state.filterTag = null;
        renderAll();
      };
    });

    var tags = allTags();
    $("#tagCloud").innerHTML = tags.map(function (t) {
      return '<span class="tag-chip ' + (state.filterTag === t ? "active" : "") + '" data-tag="' + escapeHtml(t) + '">#' + escapeHtml(t) + "</span>";
    }).join("");
    $all("#tagCloud .tag-chip").forEach(function (chip) {
      chip.onclick = function () {
        var t = chip.getAttribute("data-tag");
        state.filterTag = state.filterTag === t ? null : t;
        renderAll();
      };
    });
  }

  function renderStats() {
    var total = state.items.length;
    var uses = state.items.reduce(function (s, i) { return s + (i.useCount || 0); }, 0);
    var versions = state.items.reduce(function (s, i) { return s + ((i.versions || []).length); }, 0);
    var vars = state.items.reduce(function (s, i) { return s + getVars(i.body).length; }, 0);
    $("#stats").innerHTML =
      '<div class="stat-row"><span>资产总数</span><b>' + total + "</b></div>" +
      '<div class="stat-row"><span>累计复用</span><b>' + uses + "</b></div>" +
      '<div class="stat-row"><span>版本留档</span><b>' + versions + "</b></div>" +
      '<div class="stat-row"><span>可填变量</span><b>' + vars + "</b></div>";
  }

  function renderCards() {
    var list = visibleItems();
    $("#emptyState").hidden = list.length > 0;
    $("#cardGrid").style.display = list.length ? "" : "none";
    $("#cardGrid").innerHTML = list.map(function (it) {
      var meta = [];
      meta.push("更新 " + fmtTime(it.updatedAt));
      if ((it.versions || []).length > 1) meta.push((it.versions || []).length + " 个版本");
      if (getVars(it.body).length) meta.push(getVars(it.body).length + " 个变量");
      if (it.useCount) meta.push("复用 " + it.useCount + " 次");
      return (
        '<article class="pv-card" data-id="' + it.id + '">' +
          (it.useCount ? '<span class="pv-use-badge">↻ ' + it.useCount + "</span>" : "") +
          '<div class="pv-card-top"><h3 class="pv-name">' + escapeHtml(it.name) + "</h3>" +
            '<span class="pv-category">' + escapeHtml(it.category) + "</span></div>" +
          '<pre class="pv-body">' + escapeHtml(it.body) + "</pre>" +
          '<div class="pv-tags">' + (it.tags || []).map(function (t) { return '<span class="pv-tag">#' + escapeHtml(t) + "</span>"; }).join("") + "</div>" +
          '<div class="pv-meta">' + meta.map(escapeHtml).join("<span>·</span>") + "</div>" +
          '<div class="pv-actions">' +
            '<button class="btn" data-act="run">▶ 填变量运行</button>' +
            '<button class="btn" data-act="copy">⧉ 复制</button>' +
            '<button class="btn" data-act="edit">✎ 编辑</button>' +
            '<button class="btn" data-act="history">⏱ 版本</button>' +
            '<button class="btn" data-act="share">↗ 分享</button>' +
            '<button class="btn ghost" data-act="delete" title="删除">✕</button>' +
          "</div>" +
        "</article>"
      );
    }).join("");

    $all("#cardGrid .pv-card").forEach(function (card) {
      var id = card.getAttribute("data-id");
      Array.prototype.forEach.call(card.querySelectorAll("[data-act]"), function (btn) {
        btn.onclick = function () { handleAction(btn.getAttribute("data-act"), id); };
      });
    });
  }

  /* ---------- 动作 ---------- */
  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function handleAction(act, id) {
    var it = findItem(id);
    if (!it) return;
    if (act === "run") openRunner(it);
    else if (act === "copy") {
      copyText(it.body, "已复制原始提示词");
      it.useCount = (it.useCount || 0) + 1;
      save(); renderCards(); renderStats();
    }
    else if (act === "edit") openEditor(it);
    else if (act === "history") openHistory(it);
    else if (act === "share") shareItem(it);
    else if (act === "delete") {
      if (confirm('确定删除「' + it.name + '」？该资产的全部版本历史将一并删除。')) {
        state.items = state.items.filter(function (x) { return x.id !== id; });
        save(); renderAll(); toast("已删除");
      }
    }
  }

  /* ---------- 编辑器 ---------- */
  function openEditor(it) {
    editingId = it ? it.id : null;
    $("#editorTitle").textContent = it ? "编辑提示词" : "新建提示词";
    $("#btnEditorSave").textContent = it ? "保存（留版本档）" : "保存为资产";
    $("#fName").value = it ? it.name : "";
    $("#fCategory").value = it ? it.category : (state.filterCategory !== "全部" ? state.filterCategory : "");
    $("#fTags").value = it ? (it.tags || []).join(" ") : "";
    $("#fBody").value = it ? it.body : "";
    updateVarPreview();
    // 分类联想
    $("#categorySuggestions").innerHTML = categories().map(function (c) {
      return '<option value="' + escapeHtml(c) + '">';
    }).join("");
    $("#editorModal").showModal();
    setTimeout(function () { $("#fName").focus(); }, 60);
  }
  function updateVarPreview() {
    var vars = getVars($("#fBody").value);
    var box = $("#varPreview");
    if (vars.length) {
      box.hidden = false;
      box.innerHTML = "识别到变量：" + vars.map(function (v) { return "<code>{{" + escapeHtml(v) + "}}</code>"; }).join(" ") +
        "（运行时可逐个填充，生成成品）";
    } else { box.hidden = true; }
  }

  function submitEditor(e) {
    e.preventDefault();
    var name = $("#fName").value.trim();
    var category = $("#fCategory").value.trim() || "未分类";
    var tags = $("#fTags").value.trim().split(/\s+/).filter(Boolean).slice(0, 5);
    var body = $("#fBody").value.trim();
    if (!name || !body) { toast("名称和正文不能为空"); return; }

    if (editingId) {
      var it = findItem(editingId);
      if (!it) return;
      if (it.body !== body) {
        it.versions = it.versions || [];
        it.versions.push({ ts: now(), body: body });
        if (it.versions.length > 30) it.versions = it.versions.slice(-30);
      }
      it.name = name; it.category = category; it.tags = tags; it.body = body;
      it.updatedAt = now();
      toast("已保存，本次修改已留版本档");
    } else {
      state.items.push({
        id: uid(), name: name, category: category, tags: tags, body: body,
        versions: [{ ts: now(), body: body }],
        createdAt: now(), updatedAt: now(), useCount: 0
      });
      toast("已存入资产库");
    }
    save();
    $("#editorModal").close();
    renderAll();
  }

  /* ---------- 运行器 ---------- */
  function openRunner(it) {
    runningId = it.id;
    var vars = getVars(it.body);
    $("#runnerTitle").textContent = "运行 · " + it.name;
    $("#runnerHint").innerHTML = vars.length
      ? "检测到 " + vars.length + " 个变量，填好后复制成品即可使用。"
      : "该提示词没有变量，直接复制即可使用。";
    $("#runnerFields").innerHTML = vars.map(function (v) {
      return '<label>' + escapeHtml(v) + '<input type="text" data-var="' + escapeHtml(v) + '" placeholder="填入「' + escapeHtml(v) + '」…"></label>';
    }).join("");
    Array.prototype.forEach.call($("#runnerFields").querySelectorAll("input"), function (inp) {
      inp.oninput = renderRunnerOutput;
    });
    renderRunnerOutput();
    $("#runnerModal").showModal();
  }
  function renderRunnerOutput() {
    var it = findItem(runningId);
    if (!it) return;
    var out = it.body;
    var filled = 0;
    Array.prototype.forEach.call($("#runnerFields").querySelectorAll("input"), function (inp) {
      var v = inp.getAttribute("data-var");
      var val = inp.value;
      if (val) filled++;
      out = out.split("{{" + v + "}}").join(val || "{{" + v + "}}");
      out = out.split("{{ " + v + " }}").join(val || "{{" + v + "}}");
    });
    $("#runnerOutput").textContent = out;
    $("#runnerHint").innerHTML = getVars(it.body).length
      ? "已填 " + filled + " / " + getVars(it.body).length + " 个变量。"
      : "该提示词没有变量，直接复制即可使用。";
  }

  /* ---------- 版本历史 ---------- */
  function openHistory(it) {
    historyId = it.id;
    $("#historyTitle").textContent = "版本历史 · " + it.name;
    var vs = (it.versions || []).slice().reverse();   // 最新在前
    $("#historyList").innerHTML = vs.map(function (v, idx) {
      var isCurrent = idx === 0;
      return '<div class="history-item ' + (isCurrent ? "current" : "") + '">' +
        '<div class="hi-meta"><b>' + (isCurrent ? "当前版本" : "V" + (vs.length - idx)) + "</b> · " + fmtTime(v.ts) +
        " · " + v.body.length + " 字</div>" +
        (isCurrent ? "" : '<button class="btn small" data-ts="' + v.ts + '">回滚到此版</button>') +
        "</div>";
    }).join("");
    Array.prototype.forEach.call($("#historyList").querySelectorAll("[data-ts]"), function (btn) {
      btn.onclick = function () {
        var it2 = findItem(historyId);
        if (!it2) return;
        var ts = Number(btn.getAttribute("data-ts"));
        var target = null;
        (it2.versions || []).forEach(function (v) { if (v.ts === ts) target = v; });
        if (!target) return;
        // 回滚 = 以旧版本内容生成新版本
        it2.versions.push({ ts: now(), body: target.body });
        it2.body = target.body;
        it2.updatedAt = now();
        save(); renderAll();
        openHistory(it2);
        toast("已回滚，并生成新版本档");
      };
    });
    $("#historyModal").showModal();
  }

  /* ---------- 分享 ---------- */
  function shareItem(it) {
    var payload = { n: it.name, c: it.category, t: it.tags || [], b: it.body };
    var code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    var url = location.origin + location.pathname + "#p=" + code;
    copyText(url, "分享链接已复制，发给 TA 打开即可一键导入");
    if (navigator.share) {
      navigator.share({ title: "PromptVault 分享 · " + it.name, url: url }).catch(function () {});
    }
  }
  function checkShareHash() {
    var m = location.hash.match(/#p=([A-Za-z0-9+/=]+)/);
    if (!m) return;
    try {
      var data = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      $("#receivePreview").innerHTML =
        "<b>" + escapeHtml(data.n || "未命名提示词") + "</b>" +
        (data.c ? '　<span class="pv-category">' + escapeHtml(data.c) + "</span>" : "") +
        "\n" + escapeHtml(data.b || "");
      $("#receiveModal")._payload = data;
      $("#receiveModal").showModal();
    } catch (e) { /* 无效链接忽略 */ }
  }

  /* ---------- 导入导出 ---------- */
  function doExport() {
    var blob = new Blob([JSON.stringify({ app: "promptvault", version: 1, exportedAt: now(), items: state.items }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "promptvault-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast("已导出 JSON 备份");
  }
  function doImportFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var incoming = Array.isArray(data) ? data : (data.items || []);
        if (!incoming.length) { toast("文件里没有可导入的资产"); return; }
        var exist = {};
        state.items.forEach(function (i) { exist[i.id] = true; });
        var added = 0;
        incoming.forEach(function (raw) {
          if (!raw || !raw.body) return;
          var item = {
            id: exist[raw.id] ? uid() : (raw.id || uid()),
            name: String(raw.name || "导入的提示词").slice(0, 60),
            category: String(raw.category || "导入").slice(0, 20),
            tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 5) : [],
            body: String(raw.body),
            versions: Array.isArray(raw.versions) ? raw.versions : [{ ts: now(), body: String(raw.body) }],
            createdAt: raw.createdAt || now(), updatedAt: raw.updatedAt || now(),
            useCount: raw.useCount || 0
          };
          state.items.push(item); added++;
        });
        save(); renderAll();
        toast("已导入 " + added + " 条资产");
      } catch (e) { toast("导入失败：不是有效的备份文件"); }
    };
    reader.readAsText(file);
  }

  /* ---------- 示例数据 ---------- */
  var DEMO = [
    { name: "周报初稿生成器", category: "办公", tags: ["周报", "汇报"], useCount: 12, versions: 3,
      body: "你是我的工作汇报助理。根据我提供的工作流水，帮我写一份周报。\n\n【本周工作流水】\n{{工作流水}}\n\n要求：\n1. 按「核心产出 / 进行中 / 下周计划」三段组织；\n2. 每条以动词开头，突出结果而非过程；\n3. 保留可量化数字，没有数字的条目不许编造；\n4. 全文不超过 300 字。" },
    { name: "技术方案评审预演", category: "编程", tags: ["架构", "评审"], useCount: 7, versions: 2,
      body: "你是一位严苛但公正的技术评审。阅读我的方案，从「可行性 / 成本 / 风险 / 回滚预案」四个维度各提 2 个最尖锐的问题，并指出我认为理所当然但缺乏依据的假设。\n\n【方案】\n{{方案内容}}\n\n输出格式：按维度分节，每个问题附「建议补充的材料」。" },
    { name: "文章标题打磨器", category: "写作", tags: ["标题", "新媒体"], useCount: 21, versions: 4,
      body: "根据文章核心内容，生成 10 个候选标题：3 个悬念式、3 个数字式、2 个反差式、2 个共鸣式。\n\n【文章核心内容】\n{{核心内容}}\n【目标读者】\n{{目标读者}}\n\n要求：每个不超过 20 字；不使用夸张欺骗；标注每个标题使用的心理机制。" },
    { name: "代码 Review 助手", category: "编程", tags: ["code review"], useCount: 9, versions: 2,
      body: "你是资深代码评审。只报告「会造成实际错误或维护成本」的问题，按严重度排序；风格问题一笔带过。\n\n【代码】\n{{代码}}\n【该函数的预期用途】\n{{预期用途}}\n\n每个问题给出：位置、风险、最小修改建议。" },
    { name: "会议纪要提炼", category: "办公", tags: ["会议", "纪要"], useCount: 15, versions: 1,
      body: "把会议录音转写稿整理成纪要。\n\n【转写稿】\n{{转写稿}}\n\n输出：1）一句话结论；2）达成的决定（含责任人）；3）遗留问题与下次讨论点；4）我需要跟进的事项清单。未在会上明确的事不许替与会人做决定。" },
    { name: "学习概念卡生成", category: "学习", tags: ["费曼", "学习法"], useCount: 5, versions: 2,
      body: "用费曼技巧帮我检验对一个概念的理解。我先解释{{概念}}，你扮演完全外行的提问者，针对我的解释连问 3 个「为什么/那如果」，暴露我理解里的空洞；最后给出该概念的标准解释与一个生活化类比。" },
    { name: "竞品功能对比表", category: "产品", tags: ["竞品", "调研"], useCount: 4, versions: 1,
      body: "根据我给的信息，生成竞品对比表。\n\n【我们的产品】{{我们的产品}}\n【竞品清单】{{竞品清单}}\n【关注维度】{{关注维度}}\n\n输出 Markdown 表格；信息不足处标「未知」，禁止编造竞品功能；表格后附 3 条最值得跟进的差异点。" },
    { name: "面试题深挖追问链", category: "学习", tags: ["面试", "准备"], useCount: 8, versions: 2,
      body: "针对职位「{{职位}}」和我的简历要点「{{简历要点}}」，模拟面试官连问：先问 1 个开场题，再根据我可能的回答连续追问 3 层（从实践到原理到取舍）。每层附「面试官在考察什么」。最后给出我准备的重点清单。" }
  ];
  function loadDemo() {
    DEMO.forEach(function (d) {
      var base = now() - d.versions * 86400000;
      var versions = [];
      for (var i = 0; i < d.versions; i++) {
        versions.push({ ts: base + i * 3600000, body: d.body });
      }
      state.items.push({
        id: uid(), name: d.name, category: d.category, tags: d.tags, body: d.body,
        versions: versions, createdAt: base, updatedAt: now(), useCount: d.useCount
      });
    });
    save(); renderAll();
    toast("已载入 8 条示例提示词，随时可清空");
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $("#btnAdd").onclick = function () { openEditor(null); };
    $("#btnAddEmpty").onclick = function () { openEditor(null); };
    $("#editorForm").onsubmit = submitEditor;
    $("#btnEditorCancel").onclick = function () { $("#editorModal").close(); };
    $("#fBody").oninput = updateVarPreview;

    $("#btnRunnerClose").onclick = function () { $("#runnerModal").close(); };
    $("#btnCopyFinal").onclick = function () {
      copyText($("#runnerOutput").textContent, "成品已复制");
      var it = findItem(runningId);
      if (it) { it.useCount = (it.useCount || 0) + 1; save(); renderStats(); renderCards(); }
    };
    $("#btnCopyRaw").onclick = function () {
      var it = findItem(runningId);
      if (it) copyText(it.body, "原始提示词已复制");
    };

    $("#btnHistoryClose").onclick = function () { $("#historyModal").close(); };
    $("#btnToolsClose").onclick = function () { $("#toolsModal").close(); };

    $("#btnTools").onclick = function () { $("#toolsModal").showModal(); };
    $("#btnExport").onclick = doExport;
    $("#btnImport").onclick = function () { $("#importFile").click(); };
    $("#importFile").onchange = function (e) {
      if (e.target.files && e.target.files[0]) doImportFile(e.target.files[0]);
      e.target.value = "";
    };
    $("#btnDemo").onclick = loadDemo;
    $("#btnWipe").onclick = function () {
      if (confirm("确定清空全部资产？此操作不可恢复（建议先导出备份）。")) {
        state.items = [];
        save(); renderAll();
        toast("已清空");
      }
    };

    $("#btnReceiveSkip").onclick = function () {
      $("#receiveModal").close();
      history.replaceState(null, "", location.pathname);
    };
    $("#btnReceiveSave").onclick = function () {
      var d = $("#receiveModal")._payload;
      if (d) {
        state.items.push({
          id: uid(), name: d.n || "收到的提示词", category: d.c || "导入", tags: d.t || [],
          body: d.b, versions: [{ ts: now(), body: d.b }],
          createdAt: now(), updatedAt: now(), useCount: 0
        });
        save(); renderAll();
        toast("已存入资产库");
      }
      $("#receiveModal").close();
      history.replaceState(null, "", location.pathname);
    };

    $("#searchInput").oninput = function (e) {
      state.keyword = e.target.value;
      renderCards();
    };
  }

  /* ---------- 启动 ---------- */
  load();
  if (!state.items.length) loadDemo();
  bind();
  renderAll();
  checkShareHash();
})();
