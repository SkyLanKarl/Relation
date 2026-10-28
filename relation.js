(() => {
  'use strict';

  const PARENTS = new Set(['父', '母', '养父', '养母', '继父', '继母']);
  const BIO_PARENTS = new Set(['父', '母']);
  const CHILDREN = new Set(['子', '女', '养子', '养女', '继子', '继女']);
  const BIO_CHILDREN = new Set(['子', '女']);
  const SIBLINGS = new Set(['兄', '弟', '姐', '妹']);
  const MALE_SIBLINGS = new Set(['兄', '弟']);
  const SPOUSES = new Set(['夫', '妻']);
  const AGES = new Set(['older', 'younger', 'unknown']);

  const RELATION_LABELS = {
    父: '父亲', 母: '母亲', 夫: '丈夫', 妻: '妻子',
    兄: '哥哥', 弟: '弟弟', 姐: '姐姐', 妹: '妹妹',
    子: '儿子', 女: '女儿',
    养父: '养父', 养母: '养母', 继父: '继父', 继母: '继母',
    养兄: '养兄', 养弟: '养弟', 养姐: '养姐', 养妹: '养妹',
    继兄: '继兄', 继弟: '继弟', 继姐: '继姐', 继妹: '继妹',
    养子: '养子', 养女: '养女', 继子: '继子', 继女: '继女'
  };

  const ALIASES = {
    父: '父', 父亲: '父', f: '父',
    母: '母', 母亲: '母', m: '母',
    夫: '夫', 丈夫: '夫', h: '夫',
    妻: '妻', 妻子: '妻', w: '妻',
    兄: '兄', 哥哥: '兄', ob: '兄',
    弟: '弟', 弟弟: '弟', yb: '弟',
    姐: '姐', 姐姐: '姐', os: '姐',
    妹: '妹', 妹妹: '妹', ys: '妹',
    子: '子', 儿子: '子', s: '子',
    女: '女', 女儿: '女', d: '女',
    养父: '养父', 养母: '养母', 养兄: '养兄', 养弟: '养弟',
    养姐: '养姐', 养妹: '养妹', 养子: '养子', 养女: '养女',
    继父: '继父', 继母: '继母', 继兄: '继兄', 继弟: '继弟',
    继姐: '继姐', 继妹: '继妹', 继子: '继子', 继女: '继女'
  };

  const RULES = new Map();
  const resultCache = new Map();

  function pathKey(path) {
    return path.join('-');
  }

  function add(paths, title, note = '') {
    for (const path of paths) {
      RULES.set(pathKey(path), { title, note });
    }
  }

  add([['父']], '父亲');
  add([['母']], '母亲');
  add([['夫']], '丈夫');
  add([['妻']], '妻子');
  add([['兄']], '兄');
  add([['弟']], '弟');
  add([['姐']], '姐');
  add([['妹']], '妹');
  add([['子']], '儿子');
  add([['女']], '女儿');

  add([['父', '父']], '祖父');
  add([['父', '母']], '祖母');
  add([['母', '父']], '外祖父');
  add([['母', '母']], '外祖母');

  add([['父', '兄']], '伯父');
  add([['父', '弟']], '叔父');
  add([['父', '姐'], ['父', '妹']], '姑母');
  add([['母', '兄'], ['母', '弟']], '舅父');
  add([['母', '姐'], ['母', '妹']], '姨母');
  add([['父', '兄', '妻']], '伯母');
  add([['父', '弟', '妻']], '叔母（婶母）');
  add([['父', '姐', '夫'], ['父', '妹', '夫']], '姑父');
  add([['母', '兄', '妻'], ['母', '弟', '妻']], '舅母');
  add([['母', '姐', '夫'], ['母', '妹', '夫']], '姨父');

  add([['兄', '妻']], '嫂子');
  add([['弟', '妻']], '弟媳');
  add([['姐', '夫']], '姐夫');
  add([['妹', '夫']], '妹夫');

  add([['兄', '子'], ['弟', '子']], '侄子');
  add([['兄', '女'], ['弟', '女']], '侄女');
  add([['姐', '子'], ['妹', '子']], '外甥');
  add([['姐', '女'], ['妹', '女']], '外甥女');
  add([['兄', '子', '妻'], ['弟', '子', '妻']], '侄媳');
  add([['兄', '女', '夫'], ['弟', '女', '夫']], '侄女婿');
  add([['姐', '子', '妻'], ['妹', '子', '妻']], '外甥媳');
  add([['姐', '女', '夫'], ['妹', '女', '夫']], '外甥女婿');

  add([['子', '妻']], '儿媳');
  add([['女', '夫']], '女婿');
  add([['子', '子', '妻']], '孙媳');
  add([['子', '女', '夫']], '孙女婿');
  add([['女', '子', '妻']], '外孙媳');
  add([['女', '女', '夫']], '外孙女婿');

  add([['夫', '父']], '夫父（公公）');
  add([['夫', '母']], '夫母（婆婆）');
  add([['妻', '父']], '岳父');
  add([['妻', '母']], '岳母');
  add([['夫', '兄']], '夫兄');
  add([['夫', '弟']], '夫弟');
  add([['夫', '姐']], '夫姐');
  add([['夫', '妹']], '夫妹');
  add([['妻', '兄']], '内兄');
  add([['妻', '弟']], '内弟');
  add([['妻', '姐']], '内姐');
  add([['妻', '妹']], '内妹');
  add([['夫', '兄', '妻']], '夫嫂', '与本人构成妯娌关系。');
  add([['夫', '弟', '妻']], '夫弟媳', '与本人构成妯娌关系。');
  add([['妻', '兄', '妻']], '内嫂');
  add([['妻', '弟', '妻']], '内弟媳');
  add([['妻', '姐', '夫']], '襟兄', '与本人构成连襟关系。');
  add([['妻', '妹', '夫']], '襟弟', '与本人构成连襟关系。');

  add([['父', '父', '兄']], '伯祖父');
  add([['父', '父', '弟']], '叔祖父');
  add([['父', '父', '姐'], ['父', '父', '妹']], '姑祖母');
  add([['父', '母', '兄'], ['父', '母', '弟']], '舅祖父');
  add([['父', '母', '姐'], ['父', '母', '妹']], '姨祖母');
  add([['父', '父', '兄', '妻']], '伯祖母');
  add([['父', '父', '弟', '妻']], '叔祖母');
  add([['父', '父', '姐', '夫'], ['父', '父', '妹', '夫']], '姑祖父');
  add([['父', '母', '兄', '妻'], ['父', '母', '弟', '妻']], '舅祖母');
  add([['父', '母', '姐', '夫'], ['父', '母', '妹', '夫']], '姨祖父');

  add([['子', '妻', '父'], ['女', '夫', '父']], '亲家公');
  add([['子', '妻', '母'], ['女', '夫', '母']], '亲家母');

  add([['养父']], '养父');
  add([['养母']], '养母');
  add([['继父']], '继父');
  add([['继母']], '继母');
  add([['养子']], '养子');
  add([['养女']], '养女');
  add([['继子']], '继子');
  add([['继女']], '继女');
  for (const prefix of ['养', '继']) {
    add([[prefix + '兄']], prefix + '兄');
    add([[prefix + '弟']], prefix + '弟');
    add([[prefix + '姐']], prefix + '姐');
    add([[prefix + '妹']], prefix + '妹');
  }
  add([['养子', '妻']], '养儿媳');
  add([['养女', '夫']], '养女婿');
  add([['继子', '妻']], '继儿媳');
  add([['继女', '夫']], '继女婿');

  const UPWARD_STEMS = {
    2: '祖父', 3: '曾祖父', 4: '高祖父', 5: '天祖父',
    6: '烈祖父', 7: '太祖父', 8: '远祖父', 9: '鼻祖'
  };
  const DOWNWARD_STEMS = {
    2: '孙', 3: '曾孙', 4: '玄孙', 5: '来孙',
    6: '晜孙', 7: '仍孙', 8: '云孙', 9: '耳孙'
  };
  const MALE_LAST_STEPS = new Set([
    '父', '夫', '兄', '弟', '子', '养父', '继父', '养兄', '继兄',
    '养弟', '继弟', '养子', '继子'
  ]);

  function parsePath(text) {
    if (typeof text !== 'string') throw new TypeError('关系链必须是字符串或关系代码数组。');
    const normalized = text.trim().replace(/^我(?:的)?/, '');
    if (!normalized) throw new Error('关系链不能为空。');
    const tokens = normalized.split(/(?:的|->|>|-|\/|\\|，|,|；|;|\s)+/).filter(Boolean);
    if (!tokens.length) throw new Error('没有识别到关系，请输入例如“父-母-兄”。');
    const result = [];
    const unknown = [];
    for (const token of tokens) {
      const key = token.trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(ALIASES, key)) result.push(ALIASES[key]);
      else unknown.push(token);
    }
    if (unknown.length) {
      throw new Error(`无法识别：${unknown.join('、')}。请用“的”或“-”分隔单步关系；支持：${Object.values(RELATION_LABELS).join('、')}`);
    }
    return result;
  }

  function structural(path) {
    return '我的' + path.map(step => RELATION_LABELS[step]).join('的');
  }

  function classify(path) {
    const hasAdopt = path.some(step => step.startsWith('养'));
    const hasStep = path.some(step => step.startsWith('继'));
    const hasSpouse = path.some(step => SPOUSES.has(step));
    if (hasAdopt && hasStep) return '养继混合亲属';
    if (hasAdopt) return '养亲' + (hasSpouse ? '／姻亲' : '');
    if (hasStep) return '继亲' + (hasSpouse ? '／姻亲' : '');
    if (hasSpouse) return path.length === 1 ? '配偶' : '姻亲';
    return '血亲';
  }

  function baseParent(step) {
    return step.endsWith('父') ? '父' : '母';
  }

  function baseChild(step) {
    return step.endsWith('子') ? '子' : '女';
  }

  function qualifier(path) {
    const hasAdopt = path.some(step => step.startsWith('养'));
    const hasStep = path.some(step => step.startsWith('继'));
    if (hasAdopt && hasStep) return '养继';
    if (hasAdopt) return '养';
    if (hasStep) return '继';
    return '';
  }

  function genderOfLast(path) {
    return MALE_LAST_STEPS.has(path[path.length - 1]) ? 'male' : 'female';
  }

  function siblingName(prefix, gender, age) {
    if (gender === 'male') {
      if (age === 'older') return prefix + '兄';
      if (age === 'younger') return prefix + '弟';
      return prefix + '兄弟';
    }
    if (age === 'older') return prefix + '姐';
    if (age === 'younger') return prefix + '妹';
    return prefix + '姐妹';
  }

  function makeResult(path, title, category, method, confidence, note = '', baseScore) {
    const defaultScores = { exact: 100, generative: 80, structural: 50 };
    let score = baseScore ?? defaultScores[confidence] ?? 0;
    if (/兄弟|姐妹/.test(title)) score -= 50;
    if (/第[0-9]+代|远房|隔代|目标比本人|上溯[0-9]+代|下延[0-9]+代/.test(title)) score -= 90;
    if (title.includes('结构称谓：')) score = Math.min(score, 60);
    return {
      path: pathKey(path),
      structural: structural(path),
      title,
      category,
      method,
      confidence,
      score: Math.max(0, score),
      note
    };
  }

  function linealUp(path) {
    if (path.length < 2 || !path.every(step => PARENTS.has(step))) return null;
    const n = path.length;
    const q = qualifier(path);
    const male = genderOfLast(path) === 'male';
    const maternal = baseParent(path[0]) === '母';
    const outer = maternal ? '外' : '';
    const line = maternal ? '母系' : '父系';
    if (Object.prototype.hasOwnProperty.call(UPWARD_STEMS, n)) {
      const stem = UPWARD_STEMS[n];
      const title = q + outer + (male ? stem : stem === '鼻祖' ? '鼻祖（女性）' : stem.slice(0, -1) + '母');
      const note = q
        ? q + '亲复合链条保留亲属标识，以避免与血亲混淆。'
        : '高世代称谓以书面结构为准。';
      return makeResult(path, title, classify(path), `直系生成：连续上溯${n}代，${line}`, 'generative', note);
    }
    return makeResult(
      path,
      `${q}${line}上溯${n}代直系祖先（${male ? '男性' : '女性'}）`,
      classify(path),
      `直系生成：连续上溯${n}代`,
      'generative',
      '超出传统九代常用专名，使用代际结构称谓。'
    );
  }

  function linealDown(path) {
    if (path.length < 2 || !path.every(step => CHILDREN.has(step))) return null;
    const n = path.length;
    const q = qualifier(path);
    const female = genderOfLast(path) === 'female';
    const maternal = baseChild(path[0]) === '女';
    const outer = maternal ? '外' : '';
    if (Object.prototype.hasOwnProperty.call(DOWNWARD_STEMS, n)) {
      const title = q + outer + DOWNWARD_STEMS[n] + (female ? '女' : '');
      const note = q
        ? q + '亲复合链条保留亲属标识，以避免与血亲混淆。'
        : '高世代称谓主要用于书面表达。';
      return makeResult(path, title, classify(path), `直系生成：连续下延${n}代`, 'generative', note);
    }
    return makeResult(
      path,
      `${q}${maternal ? '女儿' : '儿子'}支下延${n}代直系后裔（${female ? '女性' : '男性'}）`,
      classify(path),
      `直系生成：连续下延${n}代`,
      'generative',
      '超出传统九代常用专名，使用代际结构称谓。'
    );
  }

  function cousin(path, age) {
    if (!path.length || !BIO_PARENTS.has(path[0])) return null;
    const split = path.findIndex(step => SIBLINGS.has(step));
    if (split < 1) return null;
    const up = path.slice(0, split);
    const down = path.slice(split + 1);
    if (!down.length || !up.every(step => BIO_PARENTS.has(step)) || !down.every(step => BIO_CHILDREN.has(step))) return null;
    const a = up.length;
    if (a !== down.length) return null;
    const sibling = path[split];
    const gender = genderOfLast(path);
    const agnatic = up.every(step => step === '父') && MALE_SIBLINGS.has(sibling) && down.slice(0, -1).every(step => step === '子');
    const branch = agnatic ? '堂' : '表';
    if (a === 1) {
      let prefix = branch;
      if (branch === '表') {
        if (up[0] === '父') prefix = '姑表';
        else if (MALE_SIBLINGS.has(sibling)) prefix = '舅表';
        else prefix = '姨表';
      }
      const note = age === 'unknown' ? '长幼未知时保留“兄弟／姐妹”；确定长幼后才能精确到兄、弟、姐、妹。' : '';
      return makeResult(path, siblingName(prefix, gender, age), '血亲', '堂表亲生成：第一代堂表亲', 'generative', note);
    }
    return null;
  }

  function qualifiedSibling(path, age) {
    if (path.length !== 2 || !['养父', '养母', '继父', '继母'].includes(path[0]) || !BIO_CHILDREN.has(path[1])) return null;
    const q = qualifier(path);
    return makeResult(
      path,
      siblingName(q, genderOfLast(path), age),
      classify(path),
      '养继生成：养/继父母的子女',
      'generative',
      '这是亲属结构推导，不替代对具体法律关系的判断。'
    );
  }

  function spouseExtension(path, age, depth) {
    if (path.length < 2 || !SPOUSES.has(path[0])) return null;
    const sub = calculatePath(path.slice(1), age, depth + 1);
    const spouseWord = path[0] === '夫' ? '丈夫' : '妻子';
    return makeResult(
      path,
      `${spouseWord}的${sub.title.replace(/^结构称谓：(?:我的)?/, '')}`,
      '姻亲',
      '姻亲生成：配偶一侧关系递归',
      'generative',
      '保留完整结构以明确亲属链路。'
    );
  }

  function cousinHusband(path, age) {
    if (age === 'unknown' || path.length !== 4 || path[path.length - 1] !== '夫') return null;
    const relative = cousin(path.slice(0, -1), age);
    if (!relative || !relative.title.endsWith(age === 'older' ? '姐' : '妹')) return null;
    return makeResult(
      path,
      relative.title + '夫',
      '姻亲',
      '姻亲生成：堂表姐妹的配偶',
      'generative',
      `书面语也可称“${relative.title}婿”或“${relative.title}丈”。`
    );
  }

  function spouseOfRelative(path, age, depth) {
    if (path.length < 2 || !SPOUSES.has(path[path.length - 1])) return null;
    const sub = calculatePath(path.slice(0, -1), age, depth + 1);
    const word = path[path.length - 1] === '夫' ? '丈夫' : '妻子';
    return makeResult(
      path,
      `${sub.title.replace(/^结构称谓：(?:我的)?/, '')}的${word}`,
      classify(path),
      '姻亲生成：亲属＋配偶',
      'generative',
      '没有统一书面专名时保留结构称谓。'
    );
  }

  function fallback(path, age, depth) {
    let best = makeResult(
      path,
      '结构称谓：' + structural(path),
      classify(path),
      '任意链结构推导',
      'structural',
      '该关系可以准确描述，但没有足够稳定的统一书面专名。'
    );
    for (let length = path.length - 1; length > 0; length -= 1) {
      const nearest = calculatePath(path.slice(0, length), age, depth + 1);
      if (nearest.confidence === 'structural' || nearest.title.startsWith('结构称谓：')) continue;
      const suffix = path.slice(length).map(step => RELATION_LABELS[step]).join('的');
      const candidate = makeResult(
        path,
        `结构称谓：${nearest.title}的${suffix}`,
        classify(path),
        '结构生成：最近亲属节点延伸',
        'structural',
        '未命中稳定书面专名，已从最近的可识别亲属节点生成结构称谓。',
        60
      );
      if (candidate.score > best.score) best = candidate;
    }
    return best;
  }

  function calculatePath(path, age = 'unknown', depth = 0) {
    if (!path.length) throw new Error('关系链不能为空。');
    if (depth > 10000) throw new Error('关系链递归过深。');
    const cacheKey = `${age}|${pathKey(path)}`;
    if (resultCache.has(cacheKey)) return resultCache.get(cacheKey);

    const rule = RULES.get(pathKey(path));
    let result = rule
      ? makeResult(path, rule.title, classify(path), '常用关系精确规则', 'exact', rule.note)
      : linealUp(path) || linealDown(path) || qualifiedSibling(path, age) || cousin(path, age);
    if (!result) result = spouseExtension(path, age, depth) || cousinHusband(path, age) || spouseOfRelative(path, age, depth);
    const nearest = fallback(path, age, depth);
    if (!result || nearest.score > result.score) result = nearest;
    resultCache.set(cacheKey, result);
    return result;
  }

  function calculate(textOrPath, age = 'unknown') {
    if (!AGES.has(age)) throw new Error('age 只能是 older、younger 或 unknown。');
    const path = typeof textOrPath === 'string' ? parsePath(textOrPath) : Array.from(textOrPath || []);
    const invalid = path.filter(step => !Object.prototype.hasOwnProperty.call(RELATION_LABELS, step));
    if (invalid.length) throw new Error('存在不支持的关系代码：' + invalid.join('、'));
    const cacheKey = `${age}|${pathKey(path)}`;
    if (resultCache.has(cacheKey)) return resultCache.get(cacheKey);
    const result = calculatePath(path, age);
    resultCache.set(cacheKey, result);
    return result;
  }

  function formatResult(result) {
    const confidenceLabels = {
      exact: '常用精确规则',
      generative: '生成式规则',
      structural: '结构描述'
    };
    const lines = [
      `关系链：${result.path}`,
      `结构：${result.structural}`,
      `书面称谓：${result.title}`,
      `类别：${result.category}`,
      `推导方式：${result.method}`,
      `结果级别：${confidenceLabels[result.confidence]}`
    ];
    if (result.note) lines.push('说明：' + result.note);
    return lines.join('\n');
  }

  const api = Object.freeze({
    calculate,
    parsePath,
    structural,
    formatResult,
    clearCache: () => resultCache.clear()
  });

  if (typeof window !== 'undefined') window.KinshipCalculator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
