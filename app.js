(() => {
  'use strict';

  const STORAGE_KEY = 'qinyuan-family-tree-v1';
  const CARD_WIDTH = 156;
  const CARD_HEIGHT = 106;
  const COLUMN_GAP = 196;
  const ROW_GAP = 174;
  const genderNames = { male: '男性', female: '女性', unknown: '未设置' };
  const directNames = {
    parent: { male: '父亲', female: '母亲' },
    child: { male: '儿子', female: '女儿' }
  };

  const viewport = document.getElementById('tree-viewport');
  const canvas = document.getElementById('tree-canvas');
  const zoomLayer = document.getElementById('tree-zoom-layer');
  const lines = document.getElementById('tree-lines');
  const nodes = document.getElementById('tree-nodes');
  const zoomLevel = document.getElementById('zoom-level');
  let canvasZoom = 1;
  const details = document.getElementById('details-content');
  const familyCount = document.getElementById('family-count');
  const toast = document.getElementById('toast');
  const clearTreeButton = document.getElementById('clear-tree-button');
  const autoLayoutButton = document.getElementById('auto-layout-button');
  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmMessage = document.getElementById('confirm-message');
  const dialogCancel = document.getElementById('dialog-cancel');
  const dialogConfirm = document.getElementById('dialog-confirm');
  let relationCache = new Map();
  let pendingConfirmation = null;
  let toastTimer;
  let resizeTimer;

  function createInitialState() {
    return {
      people: {
        self: {
          id: 'self',
          name: '我',
          gender: 'unknown',
          parents: [],
          children: [],
          notes: ''
        }
      },
      selectedId: 'self'
    };
  }

  function loadState() {
    const fallback = createInitialState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !saved.people || !saved.people.self) return fallback;
      const entries = Object.entries(saved.people).filter(([id, person]) => {
        return id && person && typeof person === 'object';
      });
      if (!entries.length) return fallback;
      const people = {};
      for (const [id, person] of entries) {
        people[id] = {
          id,
          name: String(person.name || '未命名的家人').slice(0, 20),
          customName: typeof person.customName === 'boolean' ? person.customName : true,
          gender: ['male', 'female', 'unknown'].includes(person.gender) ? person.gender : 'unknown',
          stepChildren: Array.isArray(person.stepChildren) ? [...new Set(person.stepChildren.filter(String))] : [],
          parents: Array.isArray(person.parents) ? [...new Set(person.parents.filter(String))] : [],
          children: Array.isArray(person.children) ? [...new Set(person.children.filter(String))] : [],
          notes: String(person.notes || '').slice(0, 200),
          offsetX: Number.isFinite(Number(person.offsetX)) ? Number(person.offsetX) : 0
        };
      }
      for (const person of Object.values(people)) {
        person.parents = person.parents.filter(id => people[id] && id !== person.id);
        person.children = person.children.filter(id => people[id] && id !== person.id);
      }
      for (const person of Object.values(people)) {
        for (const parentId of person.parents) {
          if (!people[parentId].children.includes(person.id)) people[parentId].children.push(person.id);
        }
        for (const childId of person.children) {
          if (!people[childId].parents.includes(person.id)) people[childId].parents.push(person.id);
        }
      }
      return {
        people,
        selectedId: people[saved.selectedId] ? saved.selectedId : 'self'
      };
    } catch {
      return fallback;
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast('浏览器暂时无法保存，请不要关闭当前页面');
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function getNeighbors(id) {
    const person = state.people[id];
    return person ? [...person.parents, ...person.children].filter(otherId => state.people[otherId]) : [];
  }

  function findPath(targetId) {
    if (targetId === 'self') return ['self'];
    const queue = [['self']];
    const visited = new Set(['self']);
    for (let index = 0; index < queue.length; index += 1) {
      const path = queue[index];
      const currentId = path[path.length - 1];
      for (const neighborId of getNeighbors(currentId)) {
        if (visited.has(neighborId)) continue;
        const nextPath = [...path, neighborId];
        if (neighborId === targetId) return nextPath;
        visited.add(neighborId);
        queue.push(nextPath);
      }
    }
    return null;
  }

  function pathToCodes(path, selfGender = state.people.self.gender) {
    const codes = [];
    for (let index = 1; index < path.length; index += 1) {
      const current = state.people[path[index - 1]];
      const next = state.people[path[index]];
      const direction = current.parents.includes(next.id) ? 'parent' : 'child';
      const gender = next.id === 'self' ? selfGender : next.gender;
      const isStep = direction === 'parent'
        ? next.stepChildren && next.stepChildren.includes(current.id)
        : current.stepChildren && current.stepChildren.includes(next.id);
      const baseCode = direction === 'parent'
        ? { male: '父', female: '母' }[gender]
        : { male: '子', female: '女' }[gender];
      if (!baseCode) return null;
      codes.push(`${isStep ? '继' : ''}${baseCode}`);
    }
    return codes;
  }

  function pathToText(path) {
    const labels = { 父: '父亲', 母: '母亲', 子: '儿子', 女: '女儿', 继父: '继父', 继母: '继母', 继子: '继子', 继女: '继女' };
    const codes = pathToCodes(path);
    if (!codes) return '亲人';
    return codes.map(code => labels[code]).join('的');
  }

  function graphSpecificTitle(codes) {
    const parents = new Set(['父', '母', '继父', '继母']);
    const children = new Set(['子', '女', '继子', '继女']);
    if (codes.length === 2 && parents.has(codes[0]) && children.has(codes[1])) {
      const hasStep = [...parents, ...children].some(code => codes.includes(code) && code.startsWith('继'));
      const sibling = codes[1].endsWith('子') ? '兄弟' : '姐妹';
      return hasStep ? `继${sibling}` : sibling;
    }
    if (codes.length === 3 && ['父', '母'].includes(codes[0]) && ['父', '母'].includes(codes[1]) && ['子', '女'].includes(codes[2])) {
      if (codes[2] === '女') return codes[0] === '父' ? '姑母' : '姨母';
      return codes[0] === '父' ? '伯父 / 叔父' : '舅父';
    }
    return null;
  }

  function canonicalCodes(codes) {
    const parents = new Set(['父', '母']);
    const children = new Set(['子', '女']);
    const canonical = [];
    for (let index = 0; index < codes.length; index += 1) {
      const current = codes[index];
      const next = codes[index + 1];
      if (next && parents.has(current) && children.has(next)) {
        canonical.push(next === '子' ? '兄' : '姐');
        index += 1;
      } else if (next && children.has(current) && parents.has(next)) {
        canonical.push(next === '父' ? '夫' : '妻');
        index += 1;
      } else {
        canonical.push(current);
      }
    }
    const siblings = new Set(['兄', '弟', '姐', '妹']);
    const simplified = [];
    for (const code of canonical) {
      if (parents.has(code) && simplified.length >= 2 && siblings.has(simplified[simplified.length - 1]) && parents.has(simplified[simplified.length - 2])) {
        simplified.pop();
        simplified.push(code);
      } else if (parents.has(code) && simplified.length === 1 && siblings.has(simplified[0])) {
        simplified[0] = code;
      } else {
        simplified.push(code);
      }
    }
    return simplified;
  }

  function extendedGraphTitle(codes) {
    const parents = new Set(['父', '母']);
    const siblings = new Set(['兄', '弟', '姐', '妹']);
    const children = new Set(['子', '女']);
    if (codes.length === 4 && parents.has(codes[0]) && siblings.has(codes[1]) && children.has(codes[2])) {
      const branch = codes[0] === '父' && ['兄', '弟'].includes(codes[1]) ? '堂' : '表';
      if (codes[3] === '夫') return `${branch}姐夫 / ${branch}妹夫`;
      if (children.has(codes[3])) {
        const stem = codes[2] === '子'
          ? (codes[3] === '子' ? '侄' : '侄女')
          : (codes[3] === '子' ? '外甥' : '外甥女');
        return `${branch}${stem}`;
      }
    }
    if (codes.length === 5 && parents.has(codes[0]) && siblings.has(codes[1]) && codes[2] === '女' && codes[3] === '夫' && parents.has(codes[4])) {
      const branch = codes[0] === '父' && ['兄', '弟'].includes(codes[1]) ? '堂' : '表';
      return `${branch}姐妹夫的${codes[4] === '父' ? '父亲' : '母亲'}`;
    }
    if (codes.length === 4 && parents.has(codes[0]) && parents.has(codes[1]) && siblings.has(codes[2]) && children.has(codes[3])) {
      const branch = codes[0] === '父' && codes[1] === '父' && ['兄', '弟'].includes(codes[2]) ? '堂' : '表';
      return `${branch}${codes[3] === '子' ? '舅' : '姨'}`;
    }
    return null;
  }

  function formatTitle(title) {
    const commonTitles = {
      父亲: '爸爸', 母亲: '妈妈', 祖父: '爷爷', 祖母: '奶奶',
      外祖父: '外公', 外祖母: '外婆', 姑母: '姑妈', 舅父: '舅舅', 姨母: '姨妈'
    };
    if (commonTitles[title]) return commonTitles[title];
    if (title.startsWith('结构称谓：我的')) return title.slice(7);
    if (title.startsWith('结构称谓：')) return title.slice(5);
    return title.replace(/^(?:姑表|舅表|姨表)(兄弟|姐妹)$/, '表$1');
  }

  function calculateTitle(codes) {
    const specificTitle = graphSpecificTitle(codes);
    if (specificTitle) return formatTitle(specificTitle);
    const canonical = canonicalCodes(codes);
    const extendedTitle = extendedGraphTitle(canonical);
    if (extendedTitle) return formatTitle(extendedTitle);
    const result = window.KinshipCalculator.calculate(canonical, 'unknown');
    return formatTitle(result.title);
  }

  function calculatePathTitle(path) {
    const containsSelf = path.slice(1).includes('self');
    const genders = containsSelf && state.people.self.gender === 'unknown'
      ? ['male', 'female']
      : [state.people.self.gender];
    const titles = [];
    for (const gender of genders) {
      const codes = pathToCodes(path, gender);
      if (!codes) continue;
      const title = calculateTitle(codes);
      if (!titles.includes(title)) titles.push(title);
    }
    return titles.slice(0, 3).join(' / ');
  }

  function getRelationship(targetId) {
    const cacheKey = `${targetId}:${state.people.self.gender}`;
    if (relationCache.has(cacheKey)) return relationCache.get(cacheKey);
    if (targetId === 'self') {
      const own = { relation: '我自己', calling: '我自己', text: '' };
      relationCache.set(cacheKey, own);
      return own;
    }
    const path = findPath(targetId);
    const text = path ? pathToText(path) : '';
    const reverseText = path ? pathToText([...path].reverse()) : '';
    let relation = text || '亲人';
    let calling = reverseText || '你';
    if (path && typeof window.KinshipCalculator !== 'undefined') {
      try {
        relation = calculatePathTitle(path) || relation;
        calling = calculatePathTitle([...path].reverse()) || calling;
      } catch {
        relation = text;
        calling = reverseText;
      }
    }
    const result = { relation, calling, text };
    relationCache.set(cacheKey, result);
    return result;
  }

  function mergeUniqueDuplicates() {
    const uniqueRelations = ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆'];
    const genericNames = new Set([...uniqueRelations, '父亲', '母亲']);
    let mergedCount = 0;

    for (const relation of uniqueRelations) {
      const duplicates = Object.values(state.people).filter(person => {
        return person.id !== 'self' && getRelationship(person.id).relation === relation;
      });
      if (duplicates.length < 2) continue;
      const primary = duplicates[0];
      for (const duplicate of duplicates.slice(1)) {
        if (!state.people[duplicate.id]) continue;
        const duplicateParents = duplicate.parents.map(id => id === duplicate.id ? primary.id : id);
        const duplicateChildren = duplicate.children.map(id => id === duplicate.id ? primary.id : id);
        for (const person of Object.values(state.people)) {
          person.parents = [...new Set(person.parents.map(id => id === duplicate.id ? primary.id : id))];
          person.children = [...new Set(person.children.map(id => id === duplicate.id ? primary.id : id))];
        }
        primary.parents = [...new Set([...primary.parents, ...duplicateParents])].filter(id => id !== primary.id);
        primary.children = [...new Set([...primary.children, ...duplicateChildren])].filter(id => id !== primary.id);
        if (genericNames.has(primary.name) && !genericNames.has(duplicate.name)) primary.name = duplicate.name;
        if (duplicate.notes && duplicate.notes !== primary.notes) {
          primary.notes = [primary.notes, duplicate.notes].filter(Boolean).join('\n').slice(0, 200);
        }
        if (state.selectedId === duplicate.id) state.selectedId = primary.id;
        delete state.people[duplicate.id];
        relationCache.clear();
        mergedCount += 1;
      }
    }
    return mergedCount;
  }

  function getDepths() {
    const depths = { self: 0 };
    const queue = ['self'];
    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      const current = state.people[currentId];
      for (const parentId of current.parents) {
        if (!state.people[parentId] || parentId in depths) continue;
        depths[parentId] = depths[currentId] + 1;
        queue.push(parentId);
      }
      for (const childId of current.children) {
        if (!state.people[childId] || childId in depths) continue;
        depths[childId] = depths[currentId] - 1;
        queue.push(childId);
      }
    }
    return depths;
  }

  function optimizeGenerationOrder(generations, depths) {
    const orderedDepths = Object.keys(generations).map(Number).sort((first, second) => first - second);
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const sweep = iteration % 2 === 0 ? orderedDepths : [...orderedDepths].reverse();
      for (const depth of sweep) {
        const referenceDepth = iteration % 2 === 0 ? depth - 1 : depth + 1;
        if (!generations[referenceDepth]) continue;
        const referenceOrder = new Map(generations[referenceDepth].map((id, index) => [id, index]));
        const currentOrder = new Map(generations[depth].map((id, index) => [id, index]));
        generations[depth].sort((firstId, secondId) => {
          const score = id => {
            const neighbors = getNeighbors(id).filter(neighborId => depths[neighborId] === referenceDepth);
            if (!neighbors.length) return currentOrder.get(id);
            return neighbors.reduce((total, neighborId) => total + referenceOrder.get(neighborId), 0) / neighbors.length;
          };
          return score(firstId) - score(secondId) || currentOrder.get(firstId) - currentOrder.get(secondId);
        });
      }
    }
  }

  function calculateLayout() {
    const depths = getDepths();
    const rawX = {};
    const visited = new Set();
    let leafIndex = 0;

    function place(id, parentId) {
      if (visited.has(id)) return rawX[id] || 0;
      visited.add(id);
      const branches = getNeighbors(id).filter(neighborId => neighborId !== parentId && !visited.has(neighborId));
      if (!branches.length) {
        rawX[id] = leafIndex;
        leafIndex += 1;
      } else {
        const branchPositions = branches.map(neighborId => place(neighborId, id));
        rawX[id] = (Math.min(...branchPositions) + Math.max(...branchPositions)) / 2;
      }
      return rawX[id];
    }

    place('self', null);
    for (const id of Object.keys(state.people)) {
      if (!visited.has(id)) {
        depths[id] = 0;
        place(id, null);
      }
    }

    const generations = {};
    for (const [id, depth] of Object.entries(depths)) {
      if (!generations[depth]) generations[depth] = [];
      generations[depth].push(id);
    }
    for (const generation of Object.values(generations)) {
      generation.sort((firstId, secondId) => rawX[firstId] - rawX[secondId]);
    }
    optimizeGenerationOrder(generations, depths);
    for (const [depth, generation] of Object.entries(generations)) {
      const selfIndex = Number(depth) === 0 ? generation.indexOf('self') : -1;
      const centerIndex = selfIndex >= 0 ? selfIndex : (generation.length - 1) / 2;
      generation.forEach((id, index) => {
        rawX[id] = index - centerIndex;
      });
    }

    const depthValues = Object.values(depths);
    const minDepth = Math.min(...depthValues);
    const maxDepth = Math.max(...depthValues);
    const rawValues = Object.values(rawX);
    const minRaw = Math.min(...rawValues);
    const maxRaw = Math.max(...rawValues);
    const contentWidth = (maxRaw - minRaw) * COLUMN_GAP + CARD_WIDTH;
    const contentHeight = (maxDepth - minDepth) * ROW_GAP + CARD_HEIGHT;
    const width = Math.max(viewport.clientWidth / canvasZoom, contentWidth + 2000);
    const height = Math.max(viewport.clientHeight / canvasZoom, contentHeight + 150);
    const offsetX = (width - contentWidth) / 2 - minRaw * COLUMN_GAP;
    const offsetY = (height - contentHeight) / 2;
    const positions = {};

    for (const id of Object.keys(state.people)) {
      positions[id] = {
        x: offsetX + rawX[id] * COLUMN_GAP,
        y: offsetY + (maxDepth - depths[id]) * ROW_GAP
      };
    }
    return { positions, width, height };
  }

  let renderedPositions = {};

  function renderConnections(positions) {
    const pathParts = [];
    const drawn = new Set();
    const siblingGroups = {};
    for (const person of Object.values(state.people)) {
      if (person.parents.length < 2) continue;
      const key = [...person.parents].sort().join(':');
      if (!siblingGroups[key]) siblingGroups[key] = { parents: [...person.parents], children: [] };
      siblingGroups[key].children.push(person.id);
    }
    for (const group of Object.values(siblingGroups)) {
      const parents = group.parents.filter(id => positions[id]);
      const children = group.children.filter(id => positions[id]);
      if (parents.length < 2 || children.length < 2) continue;
      const startY = Math.max(...parents.map(id => positions[id].y + CARD_HEIGHT));
      const endY = Math.min(...children.map(id => positions[id].y));
      if (endY <= startY) continue;
      const busY = (startY + endY) / 2;
      const parentCenters = parents.map(id => positions[id].x + CARD_WIDTH / 2);
      const childCenters = children.map(id => positions[id].x + CARD_WIDTH / 2);
      const minX = Math.min(...parentCenters, ...childCenters);
      const maxX = Math.max(...parentCenters, ...childCenters);
      pathParts.push(`<path class="kinship-link kinship-bus" d="M ${minX} ${busY} L ${maxX} ${busY}"/>`);
      parents.forEach((id, index) => {
        pathParts.push(`<path class="kinship-link" d="M ${parentCenters[index]} ${startY} L ${parentCenters[index]} ${busY}"/>`);
      });
      children.forEach((id, index) => {
        pathParts.push(`<path class="kinship-link" d="M ${childCenters[index]} ${busY} L ${childCenters[index]} ${endY}"/>`);
        pathParts.push(`<circle class="kinship-link-dot" cx="${childCenters[index]}" cy="${endY - 2}" r="3"/>`);
      });
      for (const parentId of parents) {
        for (const childId of children) drawn.add(`${parentId}:${childId}`);
      }
    }
    for (const person of Object.values(state.people)) {
      for (const parentId of person.parents) {
        const edgeKey = `${parentId}:${person.id}`;
        if (drawn.has(edgeKey) || !positions[parentId] || !positions[person.id]) continue;
        drawn.add(edgeKey);
        const parent = positions[parentId];
        const child = positions[person.id];
        const startX = parent.x + CARD_WIDTH / 2;
        const startY = parent.y + CARD_HEIGHT;
        const endX = child.x + CARD_WIDTH / 2;
        const endY = child.y;
        const middleY = (startY + endY) / 2;
        pathParts.push(`<path class="kinship-link" d="M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}"/>`);
        pathParts.push(`<circle class="kinship-link-dot" cx="${endX}" cy="${endY - 2}" r="3"/>`);
      }
    }
    lines.innerHTML = pathParts.join('');
  }

  function renderTree(centerId) {
    const previousScroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
    const layout = calculateLayout();
    const { width, height } = layout;
    const positions = {};
    for (const [id, position] of Object.entries(layout.positions)) {
      positions[id] = {
        x: position.x + (Number(state.people[id].offsetX) || 0),
        y: position.y
      };
    }
    renderedPositions = positions;
    canvas.style.width = `${width * canvasZoom}px`;
    canvas.style.height = `${height * canvasZoom}px`;
    zoomLayer.style.width = `${width}px`;
    zoomLayer.style.height = `${height}px`;
    zoomLayer.style.transform = `scale(${canvasZoom})`;
    zoomLevel.textContent = `${Math.round(canvasZoom * 100)}%`;
    lines.setAttribute('width', width);
    lines.setAttribute('height', height);
    lines.setAttribute('viewBox', `0 0 ${width} ${height}`);
    renderConnections(positions);

    nodes.innerHTML = Object.values(state.people).map(person => {
      const position = positions[person.id];
      const relationship = getRelationship(person.id).relation;
      const hasLegacyGeneratedName = /^(?:(?:姑|舅|姨)?表(?:甥|侄)|隔代|结构称谓|父亲的|母亲的)/.test(person.name);
      if (person.id !== 'self' && (person.customName === false || hasLegacyGeneratedName) && relationship && relationship !== '亲人') {
        person.name = relationship.split(' / ')[0];
      }
      const selected = person.id === state.selectedId;
      const classes = ['person-card', `gender-${person.gender}`, selected ? 'is-selected' : '', person.id === 'self' ? 'is-self' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${classes}" data-person-id="${escapeHtml(person.id)}" style="left:${position.x}px;top:${position.y}px" aria-label="${escapeHtml(person.name)}，${escapeHtml(relationship)}" aria-pressed="${selected}" title="${escapeHtml(relationship)}">
        <span class="person-avatar" aria-hidden="true">${escapeHtml(person.name.trim().charAt(0) || '家')}</span>
        <span class="person-name">${escapeHtml(person.name)}</span>
        <span class="person-relation">${person.id === 'self' ? '亲缘树的起点' : escapeHtml(relationship)}</span>
      </button>`;
    }).join('');

    const count = Object.keys(state.people).length;
    familyCount.textContent = count === 1 ? '从我出发，慢慢认识每一位家人' : `${count} 位家人，${count - 1} 段美好相遇`;
    if (centerId && positions[centerId]) {
      requestAnimationFrame(() => centerPerson(centerId));
    } else {
      viewport.scrollLeft = previousScroll.left;
      viewport.scrollTop = previousScroll.top;
    }
  }

  function centerPerson(id) {
    const card = nodes.querySelector(`[data-person-id="${CSS.escape(id)}"]`);
    if (!card) return;
    viewport.scrollTo({
      left: card.offsetLeft * canvasZoom - (viewport.clientWidth - card.offsetWidth * canvasZoom) / 2,
      top: card.offsetTop * canvasZoom - (viewport.clientHeight - card.offsetHeight * canvasZoom) / 2,
      behavior: 'smooth'
    });
  }

  function parentRelationType(parent, childId) {
    return parent.stepChildren && parent.stepChildren.includes(childId) ? 'step' : 'birth';
  }

  function parentExists(person, gender, relationType = 'birth') {
    return person.parents.some(id => {
      const parent = state.people[id];
      return parent && parent.gender === gender && parentRelationType(parent, person.id) === relationType;
    });
  }

  function findReusableParent(person, gender, relationType = 'birth') {
    const candidates = new Set();
    for (const parentId of person.parents) {
      const parent = state.people[parentId];
      for (const siblingId of parent.children) {
        if (siblingId === person.id) continue;
        for (const candidateId of state.people[siblingId].parents) {
          const candidate = state.people[candidateId];
          if (candidate && candidateId !== person.id && candidate.gender === gender && parentRelationType(candidate, person.id) === relationType && !person.parents.includes(candidateId)) {
            candidates.add(candidateId);
          }
        }
      }
    }
    return candidates.size === 1 ? [...candidates][0] : null;
  }

  function addButton(direction, gender, label, relationType = 'birth') {
    const selected = state.people[state.selectedId];
    const exists = direction === 'parent' && parentExists(selected, gender, relationType);
    return `<button type="button" class="add-person-button" data-add-direction="${direction}" data-add-gender="${gender}" data-relation-type="${relationType}" ${exists ? 'disabled' : ''} aria-label="为${escapeHtml(selected.name)}添加${label}">
      <svg><use href="#icon-${exists ? 'check' : 'plus'}"></use></svg>${exists ? `${label}已添加` : label}
    </button>`;
  }

  function renderDetails() {
    const person = state.people[state.selectedId] || state.people.self;
    const relationship = getRelationship(person.id);
    const isSelf = person.id === 'self';
    const genderNote = !isSelf && state.people.self.gender === 'unknown'
      ? '<p class="relationship-note">设置“我”的性别后，反向称呼会更准确</p>'
      : '';
    const hasFather = parentExists(person, 'male');
    const hasMother = parentExists(person, 'female');
    const parentsButtonLabel = hasFather && hasMother ? '父母已添加' : hasFather || hasMother ? '一键补全父母' : '一键添加父母';
    details.innerHTML = `
      <p class="details-eyebrow details-heading">FAMILY MEMBER</p>
      <div class="details-profile">
        <div class="details-avatar gender-${person.gender}" aria-hidden="true">${escapeHtml(person.name.trim().charAt(0) || '家')}</div>
        <div class="details-profile-text">
          <h2>${escapeHtml(person.name)}</h2>
          <p>${isSelf ? '这是一切关系的起点' : `${genderNames[person.gender]} · 与“我”相连`}</p>
        </div>
      </div>
      <div class="relationships">
        <div class="relationship-card">
          <div class="relationship-label"><span>${isSelf ? '亲缘树的起点' : 'TA 是你的'}</span><svg><use href="#icon-heart"></use></svg></div>
          <p class="relationship-value" id="relationship-value">${escapeHtml(relationship.relation)}</p>
        </div>
        <div class="relationship-card calling-card">
          <div class="relationship-label"><span>${isSelf ? '在这里，你就是' : 'TA 称呼你为'}</span><svg><use href="#icon-arrow"></use></svg></div>
          <p class="relationship-value" id="calling-value">${escapeHtml(relationship.calling)}</p>
          ${genderNote}
        </div>
      </div>
      <section class="add-section" aria-label="添加亲属">
        <h3 class="section-title">从「${escapeHtml(person.name)}」继续延伸</h3>
        <button type="button" class="add-parents-button" data-add-parents ${hasFather && hasMother ? 'disabled' : ''}>
          <svg><use href="#icon-${hasFather && hasMother ? 'check' : 'users'}"></use></svg>${parentsButtonLabel}
        </button>
        <div class="add-group">
          <p class="add-group-label"><svg><use href="#icon-up"></use></svg>向上一代 · 记住来处</p>
          <div class="add-buttons">
            ${addButton('parent', 'male', '父亲')}
            ${addButton('parent', 'female', '母亲')}
            ${addButton('parent', 'male', '继父', 'step')}
            ${addButton('parent', 'female', '继母', 'step')}
          </div>
        </div>
        <div class="add-group">
          <p class="add-group-label"><svg><use href="#icon-down"></use></svg>向下一代 · 延续牵挂</p>
          <div class="add-buttons">
            ${addButton('child', 'male', '儿子')}
            ${addButton('child', 'female', '女儿')}
          </div>
        </div>
      </section>
      <section class="edit-section">
        <h3 class="section-title"><svg><use href="#icon-edit"></use></svg>${isSelf ? '我的信息' : '亲属信息'}</h3>
        <form class="edit-form" id="edit-form">
          <label class="field"><span>${isSelf ? '我的名字或称呼' : '姓名或称呼'}</span><input name="name" type="text" maxlength="20" value="${escapeHtml(person.name)}" required aria-label="姓名或称呼"></label>
          ${isSelf ? `<label class="field"><span>我的性别（用于计算互称）</span><select name="gender" aria-label="我的性别">
            <option value="unknown" ${person.gender === 'unknown' ? 'selected' : ''}>暂不设置</option>
            <option value="male" ${person.gender === 'male' ? 'selected' : ''}>男</option>
            <option value="female" ${person.gender === 'female' ? 'selected' : ''}>女</option>
          </select></label>` : ''}
          <label class="field field-notes"><span>备注（选填）</span><textarea name="notes" maxlength="200" placeholder="记下关于 ${isSelf ? '自己' : 'TA'} 的小事…" aria-label="备注">${escapeHtml(person.notes)}</textarea></label>
          <button class="save-button" type="submit"><svg><use href="#icon-check"></use></svg>保存信息</button>
        </form>
        ${isSelf
          ? '<p class="local-note">“我”是亲缘树的固定起点</p>'
          : '<button type="button" class="delete-person-button" id="delete-person-button"><svg><use href="#icon-trash"></use></svg>删除此角色</button>'}
      </section>`;
  }

  function selectPerson(id) {
    if (!state.people[id]) return;
    state.selectedId = id;
    for (const card of nodes.querySelectorAll('.person-card')) {
      const selected = card.dataset.personId === id;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
    renderDetails();
    saveState();
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `person-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function connectParent(selected, gender, relationType = 'birth') {
    const reusableParentId = findReusableParent(selected, gender, relationType);
    if (reusableParentId) {
      const existingParent = state.people[reusableParentId];
      selected.parents.push(reusableParentId);
      existingParent.children.push(selected.id);
      if (relationType === 'step') {
        if (!existingParent.stepChildren) existingParent.stepChildren = [];
        existingParent.stepChildren.push(selected.id);
      }
      relationCache.clear();
      return { person: existingParent, reused: true };
    }
    const id = makeId();
    const person = {
      id,
      name: `${relationType === 'step' ? '继' : ''}${directNames.parent[gender]}`,
      customName: false,
      gender,
      parents: [],
      children: [selected.id],
      stepChildren: relationType === 'step' ? [selected.id] : [],
      notes: ''
    };
    state.people[id] = person;
    selected.parents.push(id);
    relationCache.clear();
    const relationship = getRelationship(id).relation;
    if (relationship && relationship !== '亲人') person.name = relationship.split(' / ')[0];
    return { person, reused: false };
  }

  function resetManualOffsets() {
    for (const person of Object.values(state.people)) person.offsetX = 0;
  }

  function autoArrangeTree() {
    resetManualOffsets();
    saveState();
    renderTree(state.selectedId);
    showToast('已自动整理卡片位置与连线');
  }

  function findOpenX(desiredX, occupiedPositions) {
    for (let step = 0; step < 100; step += 1) {
      const offsets = step === 0 ? [0] : [step * COLUMN_GAP, -step * COLUMN_GAP];
      for (const offset of offsets) {
        const candidateX = desiredX + offset;
        if (candidateX < 0) continue;
        if (occupiedPositions.every(position => Math.abs(position.x - candidateX) >= COLUMN_GAP)) return candidateX;
      }
    }
    return desiredX;
  }

  function preserveStructureForNewPeople(snapshot, newIds, anchorId) {
    const layout = calculateLayout();
    const occupiedPositions = [];
    for (const [id, position] of Object.entries(snapshot)) {
      if (!state.people[id] || !layout.positions[id]) continue;
      state.people[id].offsetX = position.x - layout.positions[id].x;
      occupiedPositions.push({ x: position.x, y: layout.positions[id].y });
    }
    const anchorX = snapshot[anchorId] ? snapshot[anchorId].x : layout.positions[anchorId].x;
    const genuinelyNewIds = newIds.filter(id => !snapshot[id]);
    genuinelyNewIds.forEach((id, index) => {
      const spread = genuinelyNewIds.length > 1 ? (index === 0 ? -COLUMN_GAP / 2 : COLUMN_GAP / 2) : 0;
      const x = findOpenX(anchorX + spread, occupiedPositions);
      state.people[id].offsetX = x - layout.positions[id].x;
      occupiedPositions.push({ x, y: layout.positions[id].y });
    });
  }

  function addParents() {
    const selected = state.people[state.selectedId];
    if (!selected) return;
    const missingGenders = ['male', 'female'].filter(gender => !parentExists(selected, gender));
    if (!missingGenders.length) {
      showToast('父母都已添加，无需重复操作');
      return;
    }
    const layoutSnapshot = { ...renderedPositions };
    const results = missingGenders.map(gender => connectParent(selected, gender));
    state.selectedId = selected.id;
    relationCache.clear();
    preserveStructureForNewPeople(layoutSnapshot, results.map(result => result.person.id), selected.id);
    saveState();
    renderTree(selected.id);
    renderDetails();
    if (missingGenders.length === 2) {
      showToast(results.every(result => result.reused) ? '已连接已有父母，无需重复添加' : '父母已添加');
    } else {
      showToast(`已补全${directNames.parent[missingGenders[0]]}`);
    }
  }

  function addPerson(direction, gender, relationType = 'birth') {
    const selected = state.people[state.selectedId];
    if (!selected || !directNames[direction] || !directNames[direction][gender]) return;
    const layoutSnapshot = { ...renderedPositions };
    if (direction === 'parent') {
      if (parentExists(selected, gender, relationType)) {
        showToast(`${selected.name}已经添加过${relationType === 'step' ? '继' : ''}${directNames[direction][gender]}了`);
        return;
      }
      const result = connectParent(selected, gender, relationType);
      state.selectedId = result.person.id;
      preserveStructureForNewPeople(layoutSnapshot, [result.person.id], selected.id);
      saveState();
      renderTree(result.person.id);
      renderDetails();
      showToast(result.reused ? `已连接已有的${result.person.name}，无需重复添加` : `已添加${result.person.name}，可以继续完善信息`);
      return;
    }
    const id = makeId();
    const person = {
      id,
      name: directNames.child[gender],
      customName: false,
      gender,
      parents: [selected.id],
      children: [],
      notes: ''
    };
    state.people[id] = person;
    selected.children.push(id);
    state.selectedId = id;
    relationCache.clear();
    const relationship = getRelationship(id).relation;
    if (relationship && relationship !== '亲人') person.name = relationship.split(' / ')[0];
    preserveStructureForNewPeople(layoutSnapshot, [id], selected.id);
    saveState();
    renderTree(id);
    renderDetails();
    showToast(`已添加${person.name}，可以继续完善信息`);
  }

  function openConfirmation(title, message, confirmLabel, action) {
    pendingConfirmation = action;
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    dialogConfirm.textContent = confirmLabel;
    confirmDialog.showModal();
  }

  function getRemovedIds(id) {
    if (id === 'self' || !state.people[id]) return [];
    const connected = new Set(['self']);
    const queue = ['self'];
    for (let index = 0; index < queue.length; index += 1) {
      for (const neighborId of getNeighbors(queue[index])) {
        if (neighborId === id || connected.has(neighborId)) continue;
        connected.add(neighborId);
        queue.push(neighborId);
      }
    }
    return Object.keys(state.people).filter(personId => !connected.has(personId));
  }

  function requestDeletePerson() {
    const id = state.selectedId;
    const person = state.people[id];
    if (!person || id === 'self') return;
    const removedIds = getRemovedIds(id);
    const message = removedIds.length === 1
      ? `确定删除“${person.name}”吗？此操作无法撤销。`
      : `删除“${person.name}”后，与 TA 相连的 ${removedIds.length - 1} 位亲属也会一并移除，共 ${removedIds.length} 个角色。此操作无法撤销。`;
    openConfirmation('删除这个角色？', message, '确认删除', () => deletePersonBranch(id));
  }

  function deletePersonBranch(id) {
    const removedIds = getRemovedIds(id);
    if (!removedIds.length) return;
    for (const removedId of removedIds) delete state.people[removedId];
    for (const person of Object.values(state.people)) {
      person.parents = person.parents.filter(parentId => state.people[parentId]);
      person.children = person.children.filter(childId => state.people[childId]);
    }
    state.selectedId = 'self';
    relationCache.clear();
    saveState();
    renderTree('self');
    renderDetails();
    showToast(removedIds.length === 1 ? '角色已删除' : `已删除 ${removedIds.length} 个角色`);
  }

  function requestClearTree() {
    openConfirmation(
      '清空所有角色？',
      '将移除所有亲属，并恢复为最初的“我”。此操作无法撤销。',
      '清空角色',
      clearTree
    );
  }

  function clearTree() {
    state = createInitialState();
    relationCache.clear();
    saveState();
    renderTree('self');
    renderDetails();
    showToast('已清空，重新从“我”开始吧');
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  let cardDragState = null;
  let suppressCardClickUntil = 0;

  function finishCardDrag(event) {
    if (!cardDragState || (event && event.pointerId !== cardDragState.pointerId)) return;
    const drag = cardDragState;
    cardDragState = null;
    drag.card.classList.remove('is-dragging');
    if (drag.card.hasPointerCapture(drag.pointerId)) drag.card.releasePointerCapture(drag.pointerId);
    if (drag.moved) {
      state.people[drag.id].offsetX = drag.offsetX;
      suppressCardClickUntil = Date.now() + 300;
      saveState();
      selectPerson(drag.id);
    }
    if (event) event.stopPropagation();
  }

  nodes.addEventListener('pointerdown', event => {
    const card = event.target.closest('[data-person-id]');
    if (!card || event.button !== 0) return;
    const id = card.dataset.personId;
    const offsetX = Number(state.people[id].offsetX) || 0;
    const currentX = renderedPositions[id] ? renderedPositions[id].x : card.offsetLeft;
    cardDragState = {
      id,
      card,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: currentX - offsetX,
      startOffsetX: offsetX,
      offsetX,
      moved: false
    };
    card.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });

  nodes.addEventListener('pointermove', event => {
    if (!cardDragState || event.pointerId !== cardDragState.pointerId) return;
    const drag = cardDragState;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    const maxX = Math.max(0, zoomLayer.offsetWidth - CARD_WIDTH);
    const nextX = Math.min(maxX, Math.max(0, drag.baseX + drag.startOffsetX + deltaX / canvasZoom));
    drag.offsetX = nextX - drag.baseX;
    renderedPositions[drag.id].x = nextX;
    drag.card.style.left = `${nextX}px`;
    drag.card.classList.add('is-dragging');
    renderConnections(renderedPositions);
    event.preventDefault();
    event.stopPropagation();
  });

  nodes.addEventListener('pointerup', finishCardDrag);
  nodes.addEventListener('pointercancel', finishCardDrag);
  nodes.addEventListener('lostpointercapture', finishCardDrag);
  window.addEventListener('blur', () => finishCardDrag());

  nodes.addEventListener('click', event => {
    const card = event.target.closest('[data-person-id]');
    if (!card) return;
    if (Date.now() < suppressCardClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    selectPerson(card.dataset.personId);
  });

  details.addEventListener('click', event => {
    if (event.target.closest('#delete-person-button')) {
      requestDeletePerson();
      return;
    }
    const parentsButton = event.target.closest('[data-add-parents]');
    if (parentsButton && !parentsButton.disabled) {
      addParents();
      return;
    }
    const button = event.target.closest('[data-add-direction]');
    if (button && !button.disabled) addPerson(button.dataset.addDirection, button.dataset.addGender, button.dataset.relationType || 'birth');
  });

  autoLayoutButton.addEventListener('click', autoArrangeTree);
  clearTreeButton.addEventListener('click', requestClearTree);
  dialogCancel.addEventListener('click', () => confirmDialog.close());
  dialogConfirm.addEventListener('click', () => {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    confirmDialog.close();
    if (action) action();
  });
  confirmDialog.addEventListener('close', () => {
    pendingConfirmation = null;
  });
  confirmDialog.addEventListener('click', event => {
    if (event.target === confirmDialog) confirmDialog.close();
  });

  details.addEventListener('submit', event => {
    if (event.target.id !== 'edit-form') return;
    event.preventDefault();
    const formData = new FormData(event.target);
    const name = String(formData.get('name') || '').trim();
    if (!name) {
      showToast('请填写姓名或称呼');
      return;
    }
    const person = state.people[state.selectedId];
    person.name = name;
    person.customName = true;
    person.notes = String(formData.get('notes') || '').trim();
    if (person.id === 'self') {
      const gender = String(formData.get('gender'));
      person.gender = ['male', 'female', 'unknown'].includes(gender) ? gender : 'unknown';
    }
    relationCache.clear();
    saveState();
    renderTree();
    renderDetails();
    showToast('信息已保存');
  });

  let panState = null;

  function stopPanning(event) {
    if (!panState || (event && event.pointerId !== panState.pointerId)) return;
    const pointerId = panState.pointerId;
    panState = null;
    viewport.classList.remove('is-panning');
    if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
  }

  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.person-card')) return;
    const bounds = viewport.getBoundingClientRect();
    if (event.clientX >= bounds.left + viewport.clientWidth || event.clientY >= bounds.top + viewport.clientHeight) return;
    panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false
    };
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', event => {
    if (!panState || event.pointerId !== panState.pointerId) return;
    const deltaX = event.clientX - panState.startX;
    const deltaY = event.clientY - panState.startY;
    if (!panState.moved && Math.hypot(deltaX, deltaY) < 4) return;
    panState.moved = true;
    viewport.classList.add('is-panning');
    viewport.scrollLeft = panState.scrollLeft - deltaX;
    viewport.scrollTop = panState.scrollTop - deltaY;
    event.preventDefault();
  });

  viewport.addEventListener('pointerup', stopPanning);
  viewport.addEventListener('pointercancel', stopPanning);
  viewport.addEventListener('lostpointercapture', stopPanning);
  window.addEventListener('blur', () => stopPanning());

  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    stopPanning();
    const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const delta = event.deltaY * deltaUnit;
    const nextZoom = Math.min(2.5, Math.max(0.5, canvasZoom * Math.exp(-delta * 0.0015)));
    if (nextZoom === canvasZoom) return;
    const bounds = viewport.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    const oldWidth = zoomLayer.offsetWidth;
    const oldHeight = zoomLayer.offsetHeight;
    const focalX = (viewport.scrollLeft + offsetX) / canvasZoom;
    const focalY = (viewport.scrollTop + offsetY) / canvasZoom;
    canvasZoom = nextZoom;
    renderTree();
    const adjustedX = focalX + (zoomLayer.offsetWidth - oldWidth) / 2;
    const adjustedY = focalY + (zoomLayer.offsetHeight - oldHeight) / 2;
    viewport.scrollLeft = adjustedX * canvasZoom - offsetX;
    viewport.scrollTop = adjustedY * canvasZoom - offsetY;
  }, { passive: false });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderTree(), 150);
  });

  const mergedCount = mergeUniqueDuplicates();
  renderTree('self');
  renderDetails();
  if (mergedCount) {
    saveState();
    showToast(`已合并 ${mergedCount} 个重复角色，并保留所有亲属连接`);
  }
})();
