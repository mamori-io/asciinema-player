var AsciinemaPlayer = (function (exports) {
  'use strict';

  const sharedConfig = {};
  function setHydrateContext(context) {
    sharedConfig.context = context;
  }

  const equalFn = (a, b) => a === b;
  const $PROXY = Symbol("solid-proxy");
  const $TRACK = Symbol("solid-track");
  const signalOptions = {
    equals: equalFn
  };
  let runEffects = runQueue;
  const STALE = 1;
  const PENDING = 2;
  const UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  let Transition = null;
  let Listener = null;
  let Updates = null;
  let Effects = null;
  let ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener,
          owner = Owner,
          unowned = fn.length === 0,
          root = unowned && !false ? UNOWNED : {
      owned: null,
      cleanups: null,
      context: null,
      owner: detachedOwner || owner
    },
          updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      comparator: options.equals || undefined
    };
    const setter = value => {
      if (typeof value === "function") {
        value = value(s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE);
    c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || undefined;
    updateComputation(c);
    return readSignal.bind(c);
  }
  function batch(fn) {
    return runUpdates(fn, false);
  }
  function untrack(fn) {
    let result,
        listener = Listener;
    Listener = null;
    result = fn();
    Listener = listener;
    return result;
  }
  function onMount(fn) {
    createEffect(() => untrack(fn));
  }
  function onCleanup(fn) {
    if (Owner === null) ;else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
    return fn;
  }
  function getListener() {
    return Listener;
  }
  function children(fn) {
    const children = createMemo(fn);
    const memo = createMemo(() => resolveChildren(children()));
    memo.toArray = () => {
      const c = memo();
      return Array.isArray(c) ? c : c != null ? [c] : [];
    };
    return memo;
  }
  function readSignal() {
    const runningTransition = Transition ;
    if (this.sources && (this.state || runningTransition )) {
      if (this.state === STALE || runningTransition ) updateComputation(this);else {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(this), false);
        Updates = updates;
      }
    }
    if (Listener) {
      const sSlot = this.observers ? this.observers.length : 0;
      if (!Listener.sources) {
        Listener.sources = [this];
        Listener.sourceSlots = [sSlot];
      } else {
        Listener.sources.push(this);
        Listener.sourceSlots.push(sSlot);
      }
      if (!this.observers) {
        this.observers = [Listener];
        this.observerSlots = [Listener.sources.length - 1];
      } else {
        this.observers.push(Listener);
        this.observerSlots.push(Listener.sources.length - 1);
      }
    }
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    let current = node.value;
    if (!node.comparator || !node.comparator(current, value)) {
      node.value = value;
      if (node.observers && node.observers.length) {
        runUpdates(() => {
          for (let i = 0; i < node.observers.length; i += 1) {
            const o = node.observers[i];
            const TransitionRunning = Transition && Transition.running;
            if (TransitionRunning && Transition.disposed.has(o)) ;
            if (TransitionRunning && !o.tState || !TransitionRunning && !o.state) {
              if (o.pure) Updates.push(o);else Effects.push(o);
              if (o.observers) markDownstream(o);
            }
            if (TransitionRunning) ;else o.state = STALE;
          }
          if (Updates.length > 10e5) {
            Updates = [];
            if (false) ;
            throw new Error();
          }
        }, false);
      }
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const owner = Owner,
          listener = Listener,
          time = ExecCount;
    Listener = Owner = node;
    runComputation(node, node.value, time);
    Listener = listener;
    Owner = owner;
  }
  function runComputation(node, value, time) {
    let nextValue;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      if (node.pure) node.state = STALE;
      handleError(err);
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.updatedAt != null && "observers" in node) {
        writeSignal(node, nextValue);
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init, pure, state = STALE, options) {
    const c = {
      fn,
      state: state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init,
      owner: Owner,
      context: null,
      pure
    };
    if (Owner === null) ;else if (Owner !== UNOWNED) {
      {
        if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
      }
    }
    return c;
  }
  function runTop(node) {
    const runningTransition = Transition ;
    if (node.state === 0 || runningTransition ) return;
    if (node.state === PENDING || runningTransition ) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (node.state || runningTransition ) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if (node.state === STALE || runningTransition ) {
        updateComputation(node);
      } else if (node.state === PENDING || runningTransition ) {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(node, ancestors[0]), false);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates) return fn();
    let wait = false;
    if (!init) Updates = [];
    if (Effects) wait = true;else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!Updates) Effects = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    const e = Effects;
    Effects = null;
    if (e.length) runUpdates(() => runEffects(e), false);
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function runUserEffects(queue) {
    let i,
        userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);else queue[userLength++] = e;
    }
    if (sharedConfig.context) setHydrateContext();
    for (i = 0; i < userLength; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    const runningTransition = Transition ;
    node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        if (source.state === STALE || runningTransition ) {
          if (source !== ignore) runTop(source);
        } else if (source.state === PENDING || runningTransition ) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    const runningTransition = Transition ;
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (!o.state || runningTransition ) {
        o.state = PENDING;
        if (o.pure) Updates.push(o);else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(),
              index = node.sourceSlots.pop(),
              obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(),
                s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.owned) {
      for (i = 0; i < node.owned.length; i++) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = 0; i < node.cleanups.length; i++) node.cleanups[i]();
      node.cleanups = null;
    }
    node.state = 0;
    node.context = null;
  }
  function castError(err) {
    if (err instanceof Error || typeof err === "string") return err;
    return new Error("Unknown error");
  }
  function handleError(err) {
    err = castError(err);
    throw err;
  }
  function resolveChildren(children) {
    if (typeof children === "function" && !children.length) return resolveChildren(children());
    if (Array.isArray(children)) {
      const results = [];
      for (let i = 0; i < children.length; i++) {
        const result = resolveChildren(children[i]);
        Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
      }
      return results;
    }
    return children;
  }

  const FALLBACK = Symbol("fallback");
  function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
  }
  function mapArray(list, mapFn, options = {}) {
    let items = [],
        mapped = [],
        disposers = [],
        len = 0,
        indexes = mapFn.length > 1 ? [] : null;
    onCleanup(() => dispose(disposers));
    return () => {
      let newItems = list() || [],
          i,
          j;
      newItems[$TRACK];
      return untrack(() => {
        let newLen = newItems.length,
            newIndices,
            newIndicesNext,
            temp,
            tempdisposers,
            tempIndexes,
            start,
            end,
            newEnd,
            item;
        if (newLen === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            indexes && (indexes = []);
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
        }
        else if (len === 0) {
          mapped = new Array(newLen);
          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapped[j] = createRoot(mapper);
          }
          len = newLen;
        } else {
          temp = new Array(newLen);
          tempdisposers = new Array(newLen);
          indexes && (tempIndexes = new Array(newLen));
          for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++);
          for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
            temp[newEnd] = mapped[end];
            tempdisposers[newEnd] = disposers[end];
            indexes && (tempIndexes[newEnd] = indexes[end]);
          }
          newIndices = new Map();
          newIndicesNext = new Array(newEnd + 1);
          for (j = newEnd; j >= start; j--) {
            item = newItems[j];
            i = newIndices.get(item);
            newIndicesNext[j] = i === undefined ? -1 : i;
            newIndices.set(item, j);
          }
          for (i = start; i <= end; i++) {
            item = items[i];
            j = newIndices.get(item);
            if (j !== undefined && j !== -1) {
              temp[j] = mapped[i];
              tempdisposers[j] = disposers[i];
              indexes && (tempIndexes[j] = indexes[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposers[i]();
          }
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapped[j] = temp[j];
              disposers[j] = tempdisposers[j];
              if (indexes) {
                indexes[j] = tempIndexes[j];
                indexes[j](j);
              }
            } else mapped[j] = createRoot(mapper);
          }
          mapped = mapped.slice(0, len = newLen);
          items = newItems.slice(0);
        }
        return mapped;
      });
      function mapper(disposer) {
        disposers[j] = disposer;
        if (indexes) {
          const [s, set] = createSignal(j);
          indexes[j] = set;
          return mapFn(newItems[j], s);
        }
        return mapFn(newItems[j]);
      }
    };
  }
  function indexArray(list, mapFn, options = {}) {
    let items = [],
        mapped = [],
        disposers = [],
        signals = [],
        len = 0,
        i;
    onCleanup(() => dispose(disposers));
    return () => {
      const newItems = list() || [];
      newItems[$TRACK];
      return untrack(() => {
        if (newItems.length === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            signals = [];
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
          return mapped;
        }
        if (items[0] === FALLBACK) {
          disposers[0]();
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
        }
        for (i = 0; i < newItems.length; i++) {
          if (i < items.length && items[i] !== newItems[i]) {
            signals[i](() => newItems[i]);
          } else if (i >= items.length) {
            mapped[i] = createRoot(mapper);
          }
        }
        for (; i < items.length; i++) {
          disposers[i]();
        }
        len = signals.length = disposers.length = newItems.length;
        items = newItems.slice(0);
        return mapped = mapped.slice(0, len);
      });
      function mapper(disposer) {
        disposers[i] = disposer;
        const [s, set] = createSignal(newItems[i]);
        signals[i] = set;
        return mapFn(s, i);
      }
    };
  }
  function createComponent(Comp, props) {
    return untrack(() => Comp(props || {}));
  }

  function For(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(mapArray(() => props.each, props.children, fallback ? fallback : undefined));
  }
  function Index(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(indexArray(() => props.each, props.children, fallback ? fallback : undefined));
  }
  function Show(props) {
    let strictEqual = false;
    const keyed = props.keyed;
    const condition = createMemo(() => props.when, undefined, {
      equals: (a, b) => strictEqual ? a === b : !a === !b
    });
    return createMemo(() => {
      const c = condition();
      if (c) {
        const child = props.children;
        const fn = typeof child === "function" && child.length > 0;
        strictEqual = keyed || fn;
        return fn ? untrack(() => child(c)) : child;
      }
      return props.fallback;
    });
  }
  function Switch(props) {
    let strictEqual = false;
    let keyed = false;
    const conditions = children(() => props.children),
          evalConditions = createMemo(() => {
      let conds = conditions();
      if (!Array.isArray(conds)) conds = [conds];
      for (let i = 0; i < conds.length; i++) {
        const c = conds[i].when;
        if (c) {
          keyed = !!conds[i].keyed;
          return [i, c, conds[i]];
        }
      }
      return [-1];
    }, undefined, {
      equals: (a, b) => a[0] === b[0] && (strictEqual ? a[1] === b[1] : !a[1] === !b[1]) && a[2] === b[2]
    });
    return createMemo(() => {
      const [index, when, cond] = evalConditions();
      if (index < 0) return props.fallback;
      const c = cond.children;
      const fn = typeof c === "function" && c.length > 0;
      strictEqual = keyed || fn;
      return fn ? untrack(() => c(when)) : c;
    });
  }
  function Match(props) {
    return props;
  }

  function memo(fn, equals) {
    return createMemo(fn, undefined, !equals ? {
      equals
    } : undefined);
  }

  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length,
        aEnd = a.length,
        bEnd = bLength,
        aStart = 0,
        bStart = 0,
        after = a[aEnd - 1].nextSibling,
        map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart,
                sequence = 1,
                t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }

  const $$EVENTS = "_$DX_DELEGATE";
  function render(code, element, init) {
    let disposer;
    createRoot(dispose => {
      disposer = dispose;
      element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
    });
    return () => {
      disposer();
      element.textContent = "";
    };
  }
  function template(html, check, isSVG) {
    const t = document.createElement("template");
    t.innerHTML = html;
    let node = t.content.firstChild;
    if (isSVG) node = node.firstChild;
    return node;
  }
  function delegateEvents(eventNames, document = window.document) {
    const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document.addEventListener(name, eventHandler);
      }
    }
  }
  function className$1(node, value) {
    if (value == null) node.removeAttribute("class");else node.className = value;
  }
  function addEventListener(node, name, handler, delegate) {
    if (delegate) {
      if (Array.isArray(handler)) {
        node[`$$${name}`] = handler[0];
        node[`$$${name}Data`] = handler[1];
      } else node[`$$${name}`] = handler;
    } else if (Array.isArray(handler)) {
      const handlerFn = handler[0];
      node.addEventListener(name, handler[0] = e => handlerFn.call(node, handler[1], e));
    } else node.addEventListener(name, handler);
  }
  function style$1(node, value, prev = {}) {
    const nodeStyle = node.style;
    const prevString = typeof prev === "string";
    if (value == null && prevString || typeof value === "string") return nodeStyle.cssText = value;
    prevString && (nodeStyle.cssText = undefined, prev = {});
    value || (value = {});
    let v, s;
    for (s in prev) {
      value[s] == null && nodeStyle.removeProperty(s);
      delete prev[s];
    }
    for (s in value) {
      v = value[s];
      if (v !== prev[s]) {
        nodeStyle.setProperty(s, v);
        prev[s] = v;
      }
    }
    return prev;
  }
  function use(fn, element, arg) {
    return untrack(() => fn(element, arg));
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
  }
  function eventHandler(e) {
    const key = `$$${e.type}`;
    let node = e.composedPath && e.composedPath()[0] || e.target;
    if (e.target !== node) {
      Object.defineProperty(e, "target", {
        configurable: true,
        value: node
      });
    }
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    if (sharedConfig.registry && !sharedConfig.done) {
      sharedConfig.done = true;
      document.querySelectorAll("[id^=pl-]").forEach(elem => elem.remove());
    }
    while (node !== null) {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node = node.host && node.host !== node && node.host instanceof Node ? node.host : node.parentNode;
    }
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    if (sharedConfig.context && !current) current = [...parent.childNodes];
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value,
          multi = marker !== undefined;
    parent = multi && current[0] && current[0].parentNode || parent;
    if (t === "string" || t === "number") {
      if (sharedConfig.context) return current;
      if (t === "number") value = value.toString();
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data = value;
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      if (sharedConfig.context) return current;
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      const currentArray = current && Array.isArray(current);
      if (normalizeIncomingArray(array, value, current, unwrapArray)) {
        createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
        return () => current;
      }
      if (sharedConfig.context) {
        if (!array.length) return current;
        for (let i = 0; i < array.length; i++) {
          if (array[i].parentNode) return current = array;
        }
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (currentArray) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value instanceof Node) {
      if (sharedConfig.context && value.parentNode) return current = multi ? [value] : value;
      if (Array.isArray(current)) {
        if (multi) return current = cleanChildren(parent, current, marker, value);
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else ;
    return current;
  }
  function normalizeIncomingArray(normalized, array, current, unwrap) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i],
          prev = current && current[i];
      if (item instanceof Node) {
        normalized.push(item);
      } else if (item == null || item === true || item === false) ; else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
      } else if ((typeof item) === "function") {
        if (unwrap) {
          while (typeof item === "function") item = item();
          dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else {
        const value = String(item);
        if (prev && prev.nodeType === 3 && prev.data === value) {
          normalized.push(prev);
        } else normalized.push(document.createTextNode(value));
      }
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === undefined) return parent.textContent = "";
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }

  function parseNpt(time) {
    if (typeof time === 'number') {
      return time;
    } else if (typeof time === 'string') {
      return time.split(':').reverse().map(parseFloat).reduce((sum, n, i) => sum + n * Math.pow(60, i));
    } else {
      return undefined;
    }
  }

  var xtermHeadless = {};

  (function (exports) {
  	(()=>{var e={349:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.CircularList=void 0;var i=r(460),n=function(){function e(e){this._maxLength=e,this.onDeleteEmitter=new i.EventEmitter,this.onInsertEmitter=new i.EventEmitter,this.onTrimEmitter=new i.EventEmitter,this._array=new Array(this._maxLength),this._startIndex=0,this._length=0;}return Object.defineProperty(e.prototype,"onDelete",{get:function(){return this.onDeleteEmitter.event},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onInsert",{get:function(){return this.onInsertEmitter.event},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onTrim",{get:function(){return this.onTrimEmitter.event},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"maxLength",{get:function(){return this._maxLength},set:function(e){if(this._maxLength!==e){for(var t=new Array(e),r=0;r<Math.min(e,this.length);r++)t[r]=this._array[this._getCyclicIndex(r)];this._array=t,this._maxLength=e,this._startIndex=0;}},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"length",{get:function(){return this._length},set:function(e){if(e>this._length)for(var t=this._length;t<e;t++)this._array[t]=void 0;this._length=e;},enumerable:!1,configurable:!0}),e.prototype.get=function(e){return this._array[this._getCyclicIndex(e)]},e.prototype.set=function(e,t){this._array[this._getCyclicIndex(e)]=t;},e.prototype.push=function(e){this._array[this._getCyclicIndex(this._length)]=e,this._length===this._maxLength?(this._startIndex=++this._startIndex%this._maxLength,this.onTrimEmitter.fire(1)):this._length++;},e.prototype.recycle=function(){if(this._length!==this._maxLength)throw new Error("Can only recycle when the buffer is full");return this._startIndex=++this._startIndex%this._maxLength,this.onTrimEmitter.fire(1),this._array[this._getCyclicIndex(this._length-1)]},Object.defineProperty(e.prototype,"isFull",{get:function(){return this._length===this._maxLength},enumerable:!1,configurable:!0}),e.prototype.pop=function(){return this._array[this._getCyclicIndex(this._length---1)]},e.prototype.splice=function(e,t){for(var r=[],i=2;i<arguments.length;i++)r[i-2]=arguments[i];if(t){for(var n=e;n<this._length-t;n++)this._array[this._getCyclicIndex(n)]=this._array[this._getCyclicIndex(n+t)];this._length-=t,this.onDeleteEmitter.fire({index:e,amount:t});}for(n=this._length-1;n>=e;n--)this._array[this._getCyclicIndex(n+r.length)]=this._array[this._getCyclicIndex(n)];for(n=0;n<r.length;n++)this._array[this._getCyclicIndex(e+n)]=r[n];if(r.length&&this.onInsertEmitter.fire({index:e,amount:r.length}),this._length+r.length>this._maxLength){var s=this._length+r.length-this._maxLength;this._startIndex+=s,this._length=this._maxLength,this.onTrimEmitter.fire(s);}else this._length+=r.length;},e.prototype.trimStart=function(e){e>this._length&&(e=this._length),this._startIndex+=e,this._length-=e,this.onTrimEmitter.fire(e);},e.prototype.shiftElements=function(e,t,r){if(!(t<=0)){if(e<0||e>=this._length)throw new Error("start argument out of range");if(e+r<0)throw new Error("Cannot shift elements in list beyond index 0");if(r>0){for(var i=t-1;i>=0;i--)this.set(e+i+r,this.get(e+i));var n=e+t+r-this._length;if(n>0)for(this._length+=n;this._length>this._maxLength;)this._length--,this._startIndex++,this.onTrimEmitter.fire(1);}else for(i=0;i<t;i++)this.set(e+i+r,this.get(e+i));}},e.prototype._getCyclicIndex=function(e){return (this._startIndex+e)%this._maxLength},e}();t.CircularList=n;},439:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.clone=void 0,t.clone=function e(t,r){if(void 0===r&&(r=5),"object"!=typeof t)return t;var i=Array.isArray(t)?[]:{};for(var n in t)i[n]=r<=1?t[n]:t[n]&&e(t[n],r-1);return i};},969:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);}),s=this&&this.__values||function(e){var t="function"==typeof Symbol&&Symbol.iterator,r=t&&e[t],i=0;if(r)return r.call(e);if(e&&"number"==typeof e.length)return {next:function(){return e&&i>=e.length&&(e=void 0),{value:e&&e[i++],done:!e}}};throw new TypeError(t?"Object is not iterable.":"Symbol.iterator is not defined.")};Object.defineProperty(t,"__esModule",{value:!0}),t.CoreTerminal=void 0;var o=r(844),a=r(585),c=r(348),f=r(866),u=r(744),h=r(302),l=r(83),p=r(460),_=r(753),d=r(730),v=r(480),g=r(994),y=r(282),b=r(435),S=r(981),m=!1,C=function(e){function t(t){var r=e.call(this)||this;return r._onBinary=new p.EventEmitter,r._onData=new p.EventEmitter,r._onLineFeed=new p.EventEmitter,r._onResize=new p.EventEmitter,r._onScroll=new p.EventEmitter,r._onWriteParsed=new p.EventEmitter,r._instantiationService=new c.InstantiationService,r.optionsService=new h.OptionsService(t),r._instantiationService.setService(a.IOptionsService,r.optionsService),r._bufferService=r.register(r._instantiationService.createInstance(u.BufferService)),r._instantiationService.setService(a.IBufferService,r._bufferService),r._logService=r._instantiationService.createInstance(f.LogService),r._instantiationService.setService(a.ILogService,r._logService),r.coreService=r.register(r._instantiationService.createInstance(l.CoreService,(function(){return r.scrollToBottom()}))),r._instantiationService.setService(a.ICoreService,r.coreService),r.coreMouseService=r._instantiationService.createInstance(_.CoreMouseService),r._instantiationService.setService(a.ICoreMouseService,r.coreMouseService),r._dirtyRowService=r._instantiationService.createInstance(d.DirtyRowService),r._instantiationService.setService(a.IDirtyRowService,r._dirtyRowService),r.unicodeService=r._instantiationService.createInstance(v.UnicodeService),r._instantiationService.setService(a.IUnicodeService,r.unicodeService),r._charsetService=r._instantiationService.createInstance(g.CharsetService),r._instantiationService.setService(a.ICharsetService,r._charsetService),r._inputHandler=new b.InputHandler(r._bufferService,r._charsetService,r.coreService,r._dirtyRowService,r._logService,r.optionsService,r.coreMouseService,r.unicodeService),r.register((0, p.forwardEvent)(r._inputHandler.onLineFeed,r._onLineFeed)),r.register(r._inputHandler),r.register((0, p.forwardEvent)(r._bufferService.onResize,r._onResize)),r.register((0, p.forwardEvent)(r.coreService.onData,r._onData)),r.register((0, p.forwardEvent)(r.coreService.onBinary,r._onBinary)),r.register(r.optionsService.onOptionChange((function(e){return r._updateOptions(e)}))),r.register(r._bufferService.onScroll((function(e){r._onScroll.fire({position:r._bufferService.buffer.ydisp,source:0}),r._dirtyRowService.markRangeDirty(r._bufferService.buffer.scrollTop,r._bufferService.buffer.scrollBottom);}))),r.register(r._inputHandler.onScroll((function(e){r._onScroll.fire({position:r._bufferService.buffer.ydisp,source:0}),r._dirtyRowService.markRangeDirty(r._bufferService.buffer.scrollTop,r._bufferService.buffer.scrollBottom);}))),r._writeBuffer=new S.WriteBuffer((function(e,t){return r._inputHandler.parse(e,t)})),r.register((0, p.forwardEvent)(r._writeBuffer.onWriteParsed,r._onWriteParsed)),r}return n(t,e),Object.defineProperty(t.prototype,"onBinary",{get:function(){return this._onBinary.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onData",{get:function(){return this._onData.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onLineFeed",{get:function(){return this._onLineFeed.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onResize",{get:function(){return this._onResize.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onWriteParsed",{get:function(){return this._onWriteParsed.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onScroll",{get:function(){var e=this;return this._onScrollApi||(this._onScrollApi=new p.EventEmitter,this.register(this._onScroll.event((function(t){var r;null===(r=e._onScrollApi)||void 0===r||r.fire(t.position);})))),this._onScrollApi.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"cols",{get:function(){return this._bufferService.cols},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"rows",{get:function(){return this._bufferService.rows},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"buffers",{get:function(){return this._bufferService.buffers},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"options",{get:function(){return this.optionsService.options},set:function(e){for(var t in e)this.optionsService.options[t]=e[t];},enumerable:!1,configurable:!0}),t.prototype.dispose=function(){var t;this._isDisposed||(e.prototype.dispose.call(this),null===(t=this._windowsMode)||void 0===t||t.dispose(),this._windowsMode=void 0);},t.prototype.write=function(e,t){this._writeBuffer.write(e,t);},t.prototype.writeSync=function(e,t){this._logService.logLevel<=a.LogLevelEnum.WARN&&!m&&(this._logService.warn("writeSync is unreliable and will be removed soon."),m=!0),this._writeBuffer.writeSync(e,t);},t.prototype.resize=function(e,t){isNaN(e)||isNaN(t)||(e=Math.max(e,u.MINIMUM_COLS),t=Math.max(t,u.MINIMUM_ROWS),this._bufferService.resize(e,t));},t.prototype.scroll=function(e,t){void 0===t&&(t=!1),this._bufferService.scroll(e,t);},t.prototype.scrollLines=function(e,t,r){this._bufferService.scrollLines(e,t,r);},t.prototype.scrollPages=function(e){this._bufferService.scrollPages(e);},t.prototype.scrollToTop=function(){this._bufferService.scrollToTop();},t.prototype.scrollToBottom=function(){this._bufferService.scrollToBottom();},t.prototype.scrollToLine=function(e){this._bufferService.scrollToLine(e);},t.prototype.registerEscHandler=function(e,t){return this._inputHandler.registerEscHandler(e,t)},t.prototype.registerDcsHandler=function(e,t){return this._inputHandler.registerDcsHandler(e,t)},t.prototype.registerCsiHandler=function(e,t){return this._inputHandler.registerCsiHandler(e,t)},t.prototype.registerOscHandler=function(e,t){return this._inputHandler.registerOscHandler(e,t)},t.prototype._setup=function(){this.optionsService.rawOptions.windowsMode&&this._enableWindowsMode();},t.prototype.reset=function(){this._inputHandler.reset(),this._bufferService.reset(),this._charsetService.reset(),this.coreService.reset(),this.coreMouseService.reset();},t.prototype._updateOptions=function(e){var t;switch(e){case"scrollback":this.buffers.resize(this.cols,this.rows);break;case"windowsMode":this.optionsService.rawOptions.windowsMode?this._enableWindowsMode():(null===(t=this._windowsMode)||void 0===t||t.dispose(),this._windowsMode=void 0);}},t.prototype._enableWindowsMode=function(){var e=this;if(!this._windowsMode){var t=[];t.push(this.onLineFeed(y.updateWindowsModeWrappedState.bind(null,this._bufferService))),t.push(this.registerCsiHandler({final:"H"},(function(){return (0, y.updateWindowsModeWrappedState)(e._bufferService),!1}))),this._windowsMode={dispose:function(){var e,r;try{for(var i=s(t),n=i.next();!n.done;n=i.next())n.value.dispose();}catch(t){e={error:t};}finally{try{n&&!n.done&&(r=i.return)&&r.call(i);}finally{if(e)throw e.error}}}};}},t}(o.Disposable);t.CoreTerminal=C;},460:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.forwardEvent=t.EventEmitter=void 0;var r=function(){function e(){this._listeners=[],this._disposed=!1;}return Object.defineProperty(e.prototype,"event",{get:function(){var e=this;return this._event||(this._event=function(t){e._listeners.push(t);var r={dispose:function(){if(!e._disposed)for(var r=0;r<e._listeners.length;r++)if(e._listeners[r]===t)return void e._listeners.splice(r,1)}};return r}),this._event},enumerable:!1,configurable:!0}),e.prototype.fire=function(e,t){for(var r=[],i=0;i<this._listeners.length;i++)r.push(this._listeners[i]);for(i=0;i<r.length;i++)r[i].call(void 0,e,t);},e.prototype.dispose=function(){this._listeners&&(this._listeners.length=0),this._disposed=!0;},e}();t.EventEmitter=r,t.forwardEvent=function(e,t){return e((function(e){return t.fire(e)}))};},435:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);});Object.defineProperty(t,"__esModule",{value:!0}),t.InputHandler=t.WindowsOptionsReportType=void 0;var s,o=r(584),a=r(116),c=r(15),f=r(844),u=r(273),h=r(482),l=r(437),p=r(460),_=r(643),d=r(511),v=r(734),g=r(585),y=r(242),b=r(351),S=r(941),m={"(":0,")":1,"*":2,"+":3,"-":1,".":2},C=131072;function w(e,t){if(e>24)return t.setWinLines||!1;switch(e){case 1:return !!t.restoreWin;case 2:return !!t.minimizeWin;case 3:return !!t.setWinPosition;case 4:return !!t.setWinSizePixels;case 5:return !!t.raiseWin;case 6:return !!t.lowerWin;case 7:return !!t.refreshWin;case 8:return !!t.setWinSizeChars;case 9:return !!t.maximizeWin;case 10:return !!t.fullscreenWin;case 11:return !!t.getWinState;case 13:return !!t.getWinPosition;case 14:return !!t.getWinSizePixels;case 15:return !!t.getScreenSizePixels;case 16:return !!t.getCellSizePixels;case 18:return !!t.getWinSizeChars;case 19:return !!t.getScreenSizeChars;case 20:return !!t.getIconTitle;case 21:return !!t.getWinTitle;case 22:return !!t.pushTitle;case 23:return !!t.popTitle;case 24:return !!t.setWinLines}return !1}!function(e){e[e.GET_WIN_SIZE_PIXELS=0]="GET_WIN_SIZE_PIXELS",e[e.GET_CELL_SIZE_PIXELS=1]="GET_CELL_SIZE_PIXELS";}(s=t.WindowsOptionsReportType||(t.WindowsOptionsReportType={}));var A=function(){function e(e,t,r,i){this._bufferService=e,this._coreService=t,this._logService=r,this._optionsService=i,this._data=new Uint32Array(0);}return e.prototype.hook=function(e){this._data=new Uint32Array(0);},e.prototype.put=function(e,t,r){this._data=(0, u.concat)(this._data,e.subarray(t,r));},e.prototype.unhook=function(e){if(!e)return this._data=new Uint32Array(0),!0;var t=(0, h.utf32ToString)(this._data);switch(this._data=new Uint32Array(0),t){case'"q':this._coreService.triggerDataEvent(o.C0.ESC+'P1$r0"q'+o.C0.ESC+"\\");break;case'"p':this._coreService.triggerDataEvent(o.C0.ESC+'P1$r61;1"p'+o.C0.ESC+"\\");break;case"r":var r=this._bufferService.buffer.scrollTop+1+";"+(this._bufferService.buffer.scrollBottom+1)+"r";this._coreService.triggerDataEvent(o.C0.ESC+"P1$r"+r+o.C0.ESC+"\\");break;case"m":this._coreService.triggerDataEvent(o.C0.ESC+"P1$r0m"+o.C0.ESC+"\\");break;case" q":var i={block:2,underline:4,bar:6}[this._optionsService.rawOptions.cursorStyle];i-=this._optionsService.rawOptions.cursorBlink?1:0,this._coreService.triggerDataEvent(o.C0.ESC+"P1$r"+i+" q"+o.C0.ESC+"\\");break;default:this._logService.debug("Unknown DCS $q %s",t),this._coreService.triggerDataEvent(o.C0.ESC+"P0$r"+o.C0.ESC+"\\");}return !0},e}(),E=function(e){function t(t,r,i,n,s,f,u,_,v){void 0===v&&(v=new c.EscapeSequenceParser);var g=e.call(this)||this;g._bufferService=t,g._charsetService=r,g._coreService=i,g._dirtyRowService=n,g._logService=s,g._optionsService=f,g._coreMouseService=u,g._unicodeService=_,g._parser=v,g._parseBuffer=new Uint32Array(4096),g._stringDecoder=new h.StringToUtf32,g._utf8Decoder=new h.Utf8ToUtf32,g._workCell=new d.CellData,g._windowTitle="",g._iconName="",g._windowTitleStack=[],g._iconNameStack=[],g._curAttrData=l.DEFAULT_ATTR_DATA.clone(),g._eraseAttrDataInternal=l.DEFAULT_ATTR_DATA.clone(),g._onRequestBell=new p.EventEmitter,g._onRequestRefreshRows=new p.EventEmitter,g._onRequestReset=new p.EventEmitter,g._onRequestSendFocus=new p.EventEmitter,g._onRequestSyncScrollBar=new p.EventEmitter,g._onRequestWindowsOptionsReport=new p.EventEmitter,g._onA11yChar=new p.EventEmitter,g._onA11yTab=new p.EventEmitter,g._onCursorMove=new p.EventEmitter,g._onLineFeed=new p.EventEmitter,g._onScroll=new p.EventEmitter,g._onTitleChange=new p.EventEmitter,g._onColor=new p.EventEmitter,g._parseStack={paused:!1,cursorStartX:0,cursorStartY:0,decodedLength:0,position:0},g._specialColors=[256,257,258],g.register(g._parser),g._activeBuffer=g._bufferService.buffer,g.register(g._bufferService.buffers.onBufferActivate((function(e){return g._activeBuffer=e.activeBuffer}))),g._parser.setCsiHandlerFallback((function(e,t){g._logService.debug("Unknown CSI code: ",{identifier:g._parser.identToString(e),params:t.toArray()});})),g._parser.setEscHandlerFallback((function(e){g._logService.debug("Unknown ESC code: ",{identifier:g._parser.identToString(e)});})),g._parser.setExecuteHandlerFallback((function(e){g._logService.debug("Unknown EXECUTE code: ",{code:e});})),g._parser.setOscHandlerFallback((function(e,t,r){g._logService.debug("Unknown OSC code: ",{identifier:e,action:t,data:r});})),g._parser.setDcsHandlerFallback((function(e,t,r){"HOOK"===t&&(r=r.toArray()),g._logService.debug("Unknown DCS code: ",{identifier:g._parser.identToString(e),action:t,payload:r});})),g._parser.setPrintHandler((function(e,t,r){return g.print(e,t,r)})),g._parser.registerCsiHandler({final:"@"},(function(e){return g.insertChars(e)})),g._parser.registerCsiHandler({intermediates:" ",final:"@"},(function(e){return g.scrollLeft(e)})),g._parser.registerCsiHandler({final:"A"},(function(e){return g.cursorUp(e)})),g._parser.registerCsiHandler({intermediates:" ",final:"A"},(function(e){return g.scrollRight(e)})),g._parser.registerCsiHandler({final:"B"},(function(e){return g.cursorDown(e)})),g._parser.registerCsiHandler({final:"C"},(function(e){return g.cursorForward(e)})),g._parser.registerCsiHandler({final:"D"},(function(e){return g.cursorBackward(e)})),g._parser.registerCsiHandler({final:"E"},(function(e){return g.cursorNextLine(e)})),g._parser.registerCsiHandler({final:"F"},(function(e){return g.cursorPrecedingLine(e)})),g._parser.registerCsiHandler({final:"G"},(function(e){return g.cursorCharAbsolute(e)})),g._parser.registerCsiHandler({final:"H"},(function(e){return g.cursorPosition(e)})),g._parser.registerCsiHandler({final:"I"},(function(e){return g.cursorForwardTab(e)})),g._parser.registerCsiHandler({final:"J"},(function(e){return g.eraseInDisplay(e)})),g._parser.registerCsiHandler({prefix:"?",final:"J"},(function(e){return g.eraseInDisplay(e)})),g._parser.registerCsiHandler({final:"K"},(function(e){return g.eraseInLine(e)})),g._parser.registerCsiHandler({prefix:"?",final:"K"},(function(e){return g.eraseInLine(e)})),g._parser.registerCsiHandler({final:"L"},(function(e){return g.insertLines(e)})),g._parser.registerCsiHandler({final:"M"},(function(e){return g.deleteLines(e)})),g._parser.registerCsiHandler({final:"P"},(function(e){return g.deleteChars(e)})),g._parser.registerCsiHandler({final:"S"},(function(e){return g.scrollUp(e)})),g._parser.registerCsiHandler({final:"T"},(function(e){return g.scrollDown(e)})),g._parser.registerCsiHandler({final:"X"},(function(e){return g.eraseChars(e)})),g._parser.registerCsiHandler({final:"Z"},(function(e){return g.cursorBackwardTab(e)})),g._parser.registerCsiHandler({final:"`"},(function(e){return g.charPosAbsolute(e)})),g._parser.registerCsiHandler({final:"a"},(function(e){return g.hPositionRelative(e)})),g._parser.registerCsiHandler({final:"b"},(function(e){return g.repeatPrecedingCharacter(e)})),g._parser.registerCsiHandler({final:"c"},(function(e){return g.sendDeviceAttributesPrimary(e)})),g._parser.registerCsiHandler({prefix:">",final:"c"},(function(e){return g.sendDeviceAttributesSecondary(e)})),g._parser.registerCsiHandler({final:"d"},(function(e){return g.linePosAbsolute(e)})),g._parser.registerCsiHandler({final:"e"},(function(e){return g.vPositionRelative(e)})),g._parser.registerCsiHandler({final:"f"},(function(e){return g.hVPosition(e)})),g._parser.registerCsiHandler({final:"g"},(function(e){return g.tabClear(e)})),g._parser.registerCsiHandler({final:"h"},(function(e){return g.setMode(e)})),g._parser.registerCsiHandler({prefix:"?",final:"h"},(function(e){return g.setModePrivate(e)})),g._parser.registerCsiHandler({final:"l"},(function(e){return g.resetMode(e)})),g._parser.registerCsiHandler({prefix:"?",final:"l"},(function(e){return g.resetModePrivate(e)})),g._parser.registerCsiHandler({final:"m"},(function(e){return g.charAttributes(e)})),g._parser.registerCsiHandler({final:"n"},(function(e){return g.deviceStatus(e)})),g._parser.registerCsiHandler({prefix:"?",final:"n"},(function(e){return g.deviceStatusPrivate(e)})),g._parser.registerCsiHandler({intermediates:"!",final:"p"},(function(e){return g.softReset(e)})),g._parser.registerCsiHandler({intermediates:" ",final:"q"},(function(e){return g.setCursorStyle(e)})),g._parser.registerCsiHandler({final:"r"},(function(e){return g.setScrollRegion(e)})),g._parser.registerCsiHandler({final:"s"},(function(e){return g.saveCursor(e)})),g._parser.registerCsiHandler({final:"t"},(function(e){return g.windowOptions(e)})),g._parser.registerCsiHandler({final:"u"},(function(e){return g.restoreCursor(e)})),g._parser.registerCsiHandler({intermediates:"'",final:"}"},(function(e){return g.insertColumns(e)})),g._parser.registerCsiHandler({intermediates:"'",final:"~"},(function(e){return g.deleteColumns(e)})),g._parser.setExecuteHandler(o.C0.BEL,(function(){return g.bell()})),g._parser.setExecuteHandler(o.C0.LF,(function(){return g.lineFeed()})),g._parser.setExecuteHandler(o.C0.VT,(function(){return g.lineFeed()})),g._parser.setExecuteHandler(o.C0.FF,(function(){return g.lineFeed()})),g._parser.setExecuteHandler(o.C0.CR,(function(){return g.carriageReturn()})),g._parser.setExecuteHandler(o.C0.BS,(function(){return g.backspace()})),g._parser.setExecuteHandler(o.C0.HT,(function(){return g.tab()})),g._parser.setExecuteHandler(o.C0.SO,(function(){return g.shiftOut()})),g._parser.setExecuteHandler(o.C0.SI,(function(){return g.shiftIn()})),g._parser.setExecuteHandler(o.C1.IND,(function(){return g.index()})),g._parser.setExecuteHandler(o.C1.NEL,(function(){return g.nextLine()})),g._parser.setExecuteHandler(o.C1.HTS,(function(){return g.tabSet()})),g._parser.registerOscHandler(0,new y.OscHandler((function(e){return g.setTitle(e),g.setIconName(e),!0}))),g._parser.registerOscHandler(1,new y.OscHandler((function(e){return g.setIconName(e)}))),g._parser.registerOscHandler(2,new y.OscHandler((function(e){return g.setTitle(e)}))),g._parser.registerOscHandler(4,new y.OscHandler((function(e){return g.setOrReportIndexedColor(e)}))),g._parser.registerOscHandler(10,new y.OscHandler((function(e){return g.setOrReportFgColor(e)}))),g._parser.registerOscHandler(11,new y.OscHandler((function(e){return g.setOrReportBgColor(e)}))),g._parser.registerOscHandler(12,new y.OscHandler((function(e){return g.setOrReportCursorColor(e)}))),g._parser.registerOscHandler(104,new y.OscHandler((function(e){return g.restoreIndexedColor(e)}))),g._parser.registerOscHandler(110,new y.OscHandler((function(e){return g.restoreFgColor(e)}))),g._parser.registerOscHandler(111,new y.OscHandler((function(e){return g.restoreBgColor(e)}))),g._parser.registerOscHandler(112,new y.OscHandler((function(e){return g.restoreCursorColor(e)}))),g._parser.registerEscHandler({final:"7"},(function(){return g.saveCursor()})),g._parser.registerEscHandler({final:"8"},(function(){return g.restoreCursor()})),g._parser.registerEscHandler({final:"D"},(function(){return g.index()})),g._parser.registerEscHandler({final:"E"},(function(){return g.nextLine()})),g._parser.registerEscHandler({final:"H"},(function(){return g.tabSet()})),g._parser.registerEscHandler({final:"M"},(function(){return g.reverseIndex()})),g._parser.registerEscHandler({final:"="},(function(){return g.keypadApplicationMode()})),g._parser.registerEscHandler({final:">"},(function(){return g.keypadNumericMode()})),g._parser.registerEscHandler({final:"c"},(function(){return g.fullReset()})),g._parser.registerEscHandler({final:"n"},(function(){return g.setgLevel(2)})),g._parser.registerEscHandler({final:"o"},(function(){return g.setgLevel(3)})),g._parser.registerEscHandler({final:"|"},(function(){return g.setgLevel(3)})),g._parser.registerEscHandler({final:"}"},(function(){return g.setgLevel(2)})),g._parser.registerEscHandler({final:"~"},(function(){return g.setgLevel(1)})),g._parser.registerEscHandler({intermediates:"%",final:"@"},(function(){return g.selectDefaultCharset()})),g._parser.registerEscHandler({intermediates:"%",final:"G"},(function(){return g.selectDefaultCharset()}));var b=function(e){S._parser.registerEscHandler({intermediates:"(",final:e},(function(){return g.selectCharset("("+e)})),S._parser.registerEscHandler({intermediates:")",final:e},(function(){return g.selectCharset(")"+e)})),S._parser.registerEscHandler({intermediates:"*",final:e},(function(){return g.selectCharset("*"+e)})),S._parser.registerEscHandler({intermediates:"+",final:e},(function(){return g.selectCharset("+"+e)})),S._parser.registerEscHandler({intermediates:"-",final:e},(function(){return g.selectCharset("-"+e)})),S._parser.registerEscHandler({intermediates:".",final:e},(function(){return g.selectCharset("."+e)})),S._parser.registerEscHandler({intermediates:"/",final:e},(function(){return g.selectCharset("/"+e)}));},S=this;for(var m in a.CHARSETS)b(m);return g._parser.registerEscHandler({intermediates:"#",final:"8"},(function(){return g.screenAlignmentPattern()})),g._parser.setErrorHandler((function(e){return g._logService.error("Parsing error: ",e),e})),g._parser.registerDcsHandler({intermediates:"$",final:"q"},new A(g._bufferService,g._coreService,g._logService,g._optionsService)),g}return n(t,e),Object.defineProperty(t.prototype,"onRequestBell",{get:function(){return this._onRequestBell.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onRequestRefreshRows",{get:function(){return this._onRequestRefreshRows.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onRequestReset",{get:function(){return this._onRequestReset.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onRequestSendFocus",{get:function(){return this._onRequestSendFocus.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onRequestSyncScrollBar",{get:function(){return this._onRequestSyncScrollBar.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onRequestWindowsOptionsReport",{get:function(){return this._onRequestWindowsOptionsReport.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onA11yChar",{get:function(){return this._onA11yChar.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onA11yTab",{get:function(){return this._onA11yTab.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onCursorMove",{get:function(){return this._onCursorMove.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onLineFeed",{get:function(){return this._onLineFeed.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onScroll",{get:function(){return this._onScroll.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onTitleChange",{get:function(){return this._onTitleChange.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onColor",{get:function(){return this._onColor.event},enumerable:!1,configurable:!0}),t.prototype.dispose=function(){e.prototype.dispose.call(this);},t.prototype._preserveStack=function(e,t,r,i){this._parseStack.paused=!0,this._parseStack.cursorStartX=e,this._parseStack.cursorStartY=t,this._parseStack.decodedLength=r,this._parseStack.position=i;},t.prototype._logSlowResolvingAsync=function(e){this._logService.logLevel<=g.LogLevelEnum.WARN&&Promise.race([e,new Promise((function(e,t){return setTimeout((function(){return t("#SLOW_TIMEOUT")}),5e3)}))]).catch((function(e){if("#SLOW_TIMEOUT"!==e)throw e;console.warn("async parser handler taking longer than 5000 ms");}));},t.prototype.parse=function(e,t){var r,i=this._activeBuffer.x,n=this._activeBuffer.y,s=0,o=this._parseStack.paused;if(o){if(r=this._parser.parse(this._parseBuffer,this._parseStack.decodedLength,t))return this._logSlowResolvingAsync(r),r;i=this._parseStack.cursorStartX,n=this._parseStack.cursorStartY,this._parseStack.paused=!1,e.length>C&&(s=this._parseStack.position+C);}if(this._logService.logLevel<=g.LogLevelEnum.DEBUG&&this._logService.debug("parsing data"+("string"==typeof e?' "'+e+'"':' "'+Array.prototype.map.call(e,(function(e){return String.fromCharCode(e)})).join("")+'"'),"string"==typeof e?e.split("").map((function(e){return e.charCodeAt(0)})):e),this._parseBuffer.length<e.length&&this._parseBuffer.length<C&&(this._parseBuffer=new Uint32Array(Math.min(e.length,C))),o||this._dirtyRowService.clearRange(),e.length>C)for(var a=s;a<e.length;a+=C){var c=a+C<e.length?a+C:e.length,f="string"==typeof e?this._stringDecoder.decode(e.substring(a,c),this._parseBuffer):this._utf8Decoder.decode(e.subarray(a,c),this._parseBuffer);if(r=this._parser.parse(this._parseBuffer,f))return this._preserveStack(i,n,f,a),this._logSlowResolvingAsync(r),r}else if(!o&&(f="string"==typeof e?this._stringDecoder.decode(e,this._parseBuffer):this._utf8Decoder.decode(e,this._parseBuffer),r=this._parser.parse(this._parseBuffer,f)))return this._preserveStack(i,n,f,0),this._logSlowResolvingAsync(r),r;this._activeBuffer.x===i&&this._activeBuffer.y===n||this._onCursorMove.fire(),this._onRequestRefreshRows.fire(this._dirtyRowService.start,this._dirtyRowService.end);},t.prototype.print=function(e,t,r){var i,n,s=this._charsetService.charset,o=this._optionsService.rawOptions.screenReaderMode,a=this._bufferService.cols,c=this._coreService.decPrivateModes.wraparound,f=this._coreService.modes.insertMode,u=this._curAttrData,l=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);this._dirtyRowService.markDirty(this._activeBuffer.y),this._activeBuffer.x&&r-t>0&&2===l.getWidth(this._activeBuffer.x-1)&&l.setCellFromCodePoint(this._activeBuffer.x-1,0,1,u.fg,u.bg,u.extended);for(var p=t;p<r;++p){if(i=e[p],n=this._unicodeService.wcwidth(i),i<127&&s){var d=s[String.fromCharCode(i)];d&&(i=d.charCodeAt(0));}if(o&&this._onA11yChar.fire((0, h.stringFromCodePoint)(i)),n||!this._activeBuffer.x){if(this._activeBuffer.x+n-1>=a)if(c){for(;this._activeBuffer.x<a;)l.setCellFromCodePoint(this._activeBuffer.x++,0,1,u.fg,u.bg,u.extended);this._activeBuffer.x=0,this._activeBuffer.y++,this._activeBuffer.y===this._activeBuffer.scrollBottom+1?(this._activeBuffer.y--,this._bufferService.scroll(this._eraseAttrData(),!0)):(this._activeBuffer.y>=this._bufferService.rows&&(this._activeBuffer.y=this._bufferService.rows-1),this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y).isWrapped=!0),l=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);}else if(this._activeBuffer.x=a-1,2===n)continue;if(f&&(l.insertCells(this._activeBuffer.x,n,this._activeBuffer.getNullCell(u),u),2===l.getWidth(a-1)&&l.setCellFromCodePoint(a-1,_.NULL_CELL_CODE,_.NULL_CELL_WIDTH,u.fg,u.bg,u.extended)),l.setCellFromCodePoint(this._activeBuffer.x++,i,n,u.fg,u.bg,u.extended),n>0)for(;--n;)l.setCellFromCodePoint(this._activeBuffer.x++,0,0,u.fg,u.bg,u.extended);}else l.getWidth(this._activeBuffer.x-1)?l.addCodepointToCell(this._activeBuffer.x-1,i):l.addCodepointToCell(this._activeBuffer.x-2,i);}r-t>0&&(l.loadCell(this._activeBuffer.x-1,this._workCell),2===this._workCell.getWidth()||this._workCell.getCode()>65535?this._parser.precedingCodepoint=0:this._workCell.isCombined()?this._parser.precedingCodepoint=this._workCell.getChars().charCodeAt(0):this._parser.precedingCodepoint=this._workCell.content),this._activeBuffer.x<a&&r-t>0&&0===l.getWidth(this._activeBuffer.x)&&!l.hasContent(this._activeBuffer.x)&&l.setCellFromCodePoint(this._activeBuffer.x,0,1,u.fg,u.bg,u.extended),this._dirtyRowService.markDirty(this._activeBuffer.y);},t.prototype.registerCsiHandler=function(e,t){var r=this;return "t"!==e.final||e.prefix||e.intermediates?this._parser.registerCsiHandler(e,t):this._parser.registerCsiHandler(e,(function(e){return !w(e.params[0],r._optionsService.rawOptions.windowOptions)||t(e)}))},t.prototype.registerDcsHandler=function(e,t){return this._parser.registerDcsHandler(e,new b.DcsHandler(t))},t.prototype.registerEscHandler=function(e,t){return this._parser.registerEscHandler(e,t)},t.prototype.registerOscHandler=function(e,t){return this._parser.registerOscHandler(e,new y.OscHandler(t))},t.prototype.bell=function(){return this._onRequestBell.fire(),!0},t.prototype.lineFeed=function(){return this._dirtyRowService.markDirty(this._activeBuffer.y),this._optionsService.rawOptions.convertEol&&(this._activeBuffer.x=0),this._activeBuffer.y++,this._activeBuffer.y===this._activeBuffer.scrollBottom+1?(this._activeBuffer.y--,this._bufferService.scroll(this._eraseAttrData())):this._activeBuffer.y>=this._bufferService.rows&&(this._activeBuffer.y=this._bufferService.rows-1),this._activeBuffer.x>=this._bufferService.cols&&this._activeBuffer.x--,this._dirtyRowService.markDirty(this._activeBuffer.y),this._onLineFeed.fire(),!0},t.prototype.carriageReturn=function(){return this._activeBuffer.x=0,!0},t.prototype.backspace=function(){var e;if(!this._coreService.decPrivateModes.reverseWraparound)return this._restrictCursor(),this._activeBuffer.x>0&&this._activeBuffer.x--,!0;if(this._restrictCursor(this._bufferService.cols),this._activeBuffer.x>0)this._activeBuffer.x--;else if(0===this._activeBuffer.x&&this._activeBuffer.y>this._activeBuffer.scrollTop&&this._activeBuffer.y<=this._activeBuffer.scrollBottom&&(null===(e=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y))||void 0===e?void 0:e.isWrapped)){this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y).isWrapped=!1,this._activeBuffer.y--,this._activeBuffer.x=this._bufferService.cols-1;var t=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);t.hasWidth(this._activeBuffer.x)&&!t.hasContent(this._activeBuffer.x)&&this._activeBuffer.x--;}return this._restrictCursor(),!0},t.prototype.tab=function(){if(this._activeBuffer.x>=this._bufferService.cols)return !0;var e=this._activeBuffer.x;return this._activeBuffer.x=this._activeBuffer.nextStop(),this._optionsService.rawOptions.screenReaderMode&&this._onA11yTab.fire(this._activeBuffer.x-e),!0},t.prototype.shiftOut=function(){return this._charsetService.setgLevel(1),!0},t.prototype.shiftIn=function(){return this._charsetService.setgLevel(0),!0},t.prototype._restrictCursor=function(e){void 0===e&&(e=this._bufferService.cols-1),this._activeBuffer.x=Math.min(e,Math.max(0,this._activeBuffer.x)),this._activeBuffer.y=this._coreService.decPrivateModes.origin?Math.min(this._activeBuffer.scrollBottom,Math.max(this._activeBuffer.scrollTop,this._activeBuffer.y)):Math.min(this._bufferService.rows-1,Math.max(0,this._activeBuffer.y)),this._dirtyRowService.markDirty(this._activeBuffer.y);},t.prototype._setCursor=function(e,t){this._dirtyRowService.markDirty(this._activeBuffer.y),this._coreService.decPrivateModes.origin?(this._activeBuffer.x=e,this._activeBuffer.y=this._activeBuffer.scrollTop+t):(this._activeBuffer.x=e,this._activeBuffer.y=t),this._restrictCursor(),this._dirtyRowService.markDirty(this._activeBuffer.y);},t.prototype._moveCursor=function(e,t){this._restrictCursor(),this._setCursor(this._activeBuffer.x+e,this._activeBuffer.y+t);},t.prototype.cursorUp=function(e){var t=this._activeBuffer.y-this._activeBuffer.scrollTop;return t>=0?this._moveCursor(0,-Math.min(t,e.params[0]||1)):this._moveCursor(0,-(e.params[0]||1)),!0},t.prototype.cursorDown=function(e){var t=this._activeBuffer.scrollBottom-this._activeBuffer.y;return t>=0?this._moveCursor(0,Math.min(t,e.params[0]||1)):this._moveCursor(0,e.params[0]||1),!0},t.prototype.cursorForward=function(e){return this._moveCursor(e.params[0]||1,0),!0},t.prototype.cursorBackward=function(e){return this._moveCursor(-(e.params[0]||1),0),!0},t.prototype.cursorNextLine=function(e){return this.cursorDown(e),this._activeBuffer.x=0,!0},t.prototype.cursorPrecedingLine=function(e){return this.cursorUp(e),this._activeBuffer.x=0,!0},t.prototype.cursorCharAbsolute=function(e){return this._setCursor((e.params[0]||1)-1,this._activeBuffer.y),!0},t.prototype.cursorPosition=function(e){return this._setCursor(e.length>=2?(e.params[1]||1)-1:0,(e.params[0]||1)-1),!0},t.prototype.charPosAbsolute=function(e){return this._setCursor((e.params[0]||1)-1,this._activeBuffer.y),!0},t.prototype.hPositionRelative=function(e){return this._moveCursor(e.params[0]||1,0),!0},t.prototype.linePosAbsolute=function(e){return this._setCursor(this._activeBuffer.x,(e.params[0]||1)-1),!0},t.prototype.vPositionRelative=function(e){return this._moveCursor(0,e.params[0]||1),!0},t.prototype.hVPosition=function(e){return this.cursorPosition(e),!0},t.prototype.tabClear=function(e){var t=e.params[0];return 0===t?delete this._activeBuffer.tabs[this._activeBuffer.x]:3===t&&(this._activeBuffer.tabs={}),!0},t.prototype.cursorForwardTab=function(e){if(this._activeBuffer.x>=this._bufferService.cols)return !0;for(var t=e.params[0]||1;t--;)this._activeBuffer.x=this._activeBuffer.nextStop();return !0},t.prototype.cursorBackwardTab=function(e){if(this._activeBuffer.x>=this._bufferService.cols)return !0;for(var t=e.params[0]||1;t--;)this._activeBuffer.x=this._activeBuffer.prevStop();return !0},t.prototype._eraseInBufferLine=function(e,t,r,i){void 0===i&&(i=!1);var n=this._activeBuffer.lines.get(this._activeBuffer.ybase+e);n.replaceCells(t,r,this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),i&&(n.isWrapped=!1);},t.prototype._resetBufferLine=function(e){var t=this._activeBuffer.lines.get(this._activeBuffer.ybase+e);t.fill(this._activeBuffer.getNullCell(this._eraseAttrData())),this._bufferService.buffer.clearMarkers(this._activeBuffer.ybase+e),t.isWrapped=!1;},t.prototype.eraseInDisplay=function(e){var t;switch(this._restrictCursor(this._bufferService.cols),e.params[0]){case 0:for(t=this._activeBuffer.y,this._dirtyRowService.markDirty(t),this._eraseInBufferLine(t++,this._activeBuffer.x,this._bufferService.cols,0===this._activeBuffer.x);t<this._bufferService.rows;t++)this._resetBufferLine(t);this._dirtyRowService.markDirty(t);break;case 1:for(t=this._activeBuffer.y,this._dirtyRowService.markDirty(t),this._eraseInBufferLine(t,0,this._activeBuffer.x+1,!0),this._activeBuffer.x+1>=this._bufferService.cols&&(this._activeBuffer.lines.get(t+1).isWrapped=!1);t--;)this._resetBufferLine(t);this._dirtyRowService.markDirty(0);break;case 2:for(t=this._bufferService.rows,this._dirtyRowService.markDirty(t-1);t--;)this._resetBufferLine(t);this._dirtyRowService.markDirty(0);break;case 3:var r=this._activeBuffer.lines.length-this._bufferService.rows;r>0&&(this._activeBuffer.lines.trimStart(r),this._activeBuffer.ybase=Math.max(this._activeBuffer.ybase-r,0),this._activeBuffer.ydisp=Math.max(this._activeBuffer.ydisp-r,0),this._onScroll.fire(0));}return !0},t.prototype.eraseInLine=function(e){switch(this._restrictCursor(this._bufferService.cols),e.params[0]){case 0:this._eraseInBufferLine(this._activeBuffer.y,this._activeBuffer.x,this._bufferService.cols,0===this._activeBuffer.x);break;case 1:this._eraseInBufferLine(this._activeBuffer.y,0,this._activeBuffer.x+1,!1);break;case 2:this._eraseInBufferLine(this._activeBuffer.y,0,this._bufferService.cols,!0);}return this._dirtyRowService.markDirty(this._activeBuffer.y),!0},t.prototype.insertLines=function(e){this._restrictCursor();var t=e.params[0]||1;if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return !0;for(var r=this._activeBuffer.ybase+this._activeBuffer.y,i=this._bufferService.rows-1-this._activeBuffer.scrollBottom,n=this._bufferService.rows-1+this._activeBuffer.ybase-i+1;t--;)this._activeBuffer.lines.splice(n-1,1),this._activeBuffer.lines.splice(r,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowService.markRangeDirty(this._activeBuffer.y,this._activeBuffer.scrollBottom),this._activeBuffer.x=0,!0},t.prototype.deleteLines=function(e){this._restrictCursor();var t=e.params[0]||1;if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return !0;var r,i=this._activeBuffer.ybase+this._activeBuffer.y;for(r=this._bufferService.rows-1-this._activeBuffer.scrollBottom,r=this._bufferService.rows-1+this._activeBuffer.ybase-r;t--;)this._activeBuffer.lines.splice(i,1),this._activeBuffer.lines.splice(r,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowService.markRangeDirty(this._activeBuffer.y,this._activeBuffer.scrollBottom),this._activeBuffer.x=0,!0},t.prototype.insertChars=function(e){this._restrictCursor();var t=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);return t&&(t.insertCells(this._activeBuffer.x,e.params[0]||1,this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),this._dirtyRowService.markDirty(this._activeBuffer.y)),!0},t.prototype.deleteChars=function(e){this._restrictCursor();var t=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);return t&&(t.deleteCells(this._activeBuffer.x,e.params[0]||1,this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),this._dirtyRowService.markDirty(this._activeBuffer.y)),!0},t.prototype.scrollUp=function(e){for(var t=e.params[0]||1;t--;)this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollTop,1),this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollBottom,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowService.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0},t.prototype.scrollDown=function(e){for(var t=e.params[0]||1;t--;)this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollBottom,1),this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollTop,0,this._activeBuffer.getBlankLine(l.DEFAULT_ATTR_DATA));return this._dirtyRowService.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0},t.prototype.scrollLeft=function(e){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return !0;for(var t=e.params[0]||1,r=this._activeBuffer.scrollTop;r<=this._activeBuffer.scrollBottom;++r){var i=this._activeBuffer.lines.get(this._activeBuffer.ybase+r);i.deleteCells(0,t,this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),i.isWrapped=!1;}return this._dirtyRowService.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0},t.prototype.scrollRight=function(e){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return !0;for(var t=e.params[0]||1,r=this._activeBuffer.scrollTop;r<=this._activeBuffer.scrollBottom;++r){var i=this._activeBuffer.lines.get(this._activeBuffer.ybase+r);i.insertCells(0,t,this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),i.isWrapped=!1;}return this._dirtyRowService.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0},t.prototype.insertColumns=function(e){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return !0;for(var t=e.params[0]||1,r=this._activeBuffer.scrollTop;r<=this._activeBuffer.scrollBottom;++r){var i=this._activeBuffer.lines.get(this._activeBuffer.ybase+r);i.insertCells(this._activeBuffer.x,t,this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),i.isWrapped=!1;}return this._dirtyRowService.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0},t.prototype.deleteColumns=function(e){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return !0;for(var t=e.params[0]||1,r=this._activeBuffer.scrollTop;r<=this._activeBuffer.scrollBottom;++r){var i=this._activeBuffer.lines.get(this._activeBuffer.ybase+r);i.deleteCells(this._activeBuffer.x,t,this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),i.isWrapped=!1;}return this._dirtyRowService.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0},t.prototype.eraseChars=function(e){this._restrictCursor();var t=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);return t&&(t.replaceCells(this._activeBuffer.x,this._activeBuffer.x+(e.params[0]||1),this._activeBuffer.getNullCell(this._eraseAttrData()),this._eraseAttrData()),this._dirtyRowService.markDirty(this._activeBuffer.y)),!0},t.prototype.repeatPrecedingCharacter=function(e){if(!this._parser.precedingCodepoint)return !0;for(var t=e.params[0]||1,r=new Uint32Array(t),i=0;i<t;++i)r[i]=this._parser.precedingCodepoint;return this.print(r,0,r.length),!0},t.prototype.sendDeviceAttributesPrimary=function(e){return e.params[0]>0||(this._is("xterm")||this._is("rxvt-unicode")||this._is("screen")?this._coreService.triggerDataEvent(o.C0.ESC+"[?1;2c"):this._is("linux")&&this._coreService.triggerDataEvent(o.C0.ESC+"[?6c")),!0},t.prototype.sendDeviceAttributesSecondary=function(e){return e.params[0]>0||(this._is("xterm")?this._coreService.triggerDataEvent(o.C0.ESC+"[>0;276;0c"):this._is("rxvt-unicode")?this._coreService.triggerDataEvent(o.C0.ESC+"[>85;95;0c"):this._is("linux")?this._coreService.triggerDataEvent(e.params[0]+"c"):this._is("screen")&&this._coreService.triggerDataEvent(o.C0.ESC+"[>83;40003;0c")),!0},t.prototype._is=function(e){return 0===(this._optionsService.rawOptions.termName+"").indexOf(e)},t.prototype.setMode=function(e){for(var t=0;t<e.length;t++)4===e.params[t]&&(this._coreService.modes.insertMode=!0);return !0},t.prototype.setModePrivate=function(e){for(var t=0;t<e.length;t++)switch(e.params[t]){case 1:this._coreService.decPrivateModes.applicationCursorKeys=!0;break;case 2:this._charsetService.setgCharset(0,a.DEFAULT_CHARSET),this._charsetService.setgCharset(1,a.DEFAULT_CHARSET),this._charsetService.setgCharset(2,a.DEFAULT_CHARSET),this._charsetService.setgCharset(3,a.DEFAULT_CHARSET);break;case 3:this._optionsService.rawOptions.windowOptions.setWinLines&&(this._bufferService.resize(132,this._bufferService.rows),this._onRequestReset.fire());break;case 6:this._coreService.decPrivateModes.origin=!0,this._setCursor(0,0);break;case 7:this._coreService.decPrivateModes.wraparound=!0;break;case 12:break;case 45:this._coreService.decPrivateModes.reverseWraparound=!0;break;case 66:this._logService.debug("Serial port requested application keypad."),this._coreService.decPrivateModes.applicationKeypad=!0,this._onRequestSyncScrollBar.fire();break;case 9:this._coreMouseService.activeProtocol="X10";break;case 1e3:this._coreMouseService.activeProtocol="VT200";break;case 1002:this._coreMouseService.activeProtocol="DRAG";break;case 1003:this._coreMouseService.activeProtocol="ANY";break;case 1004:this._coreService.decPrivateModes.sendFocus=!0,this._onRequestSendFocus.fire();break;case 1005:this._logService.debug("DECSET 1005 not supported (see #2507)");break;case 1006:this._coreMouseService.activeEncoding="SGR";break;case 1015:this._logService.debug("DECSET 1015 not supported (see #2507)");break;case 25:this._coreService.isCursorHidden=!1;break;case 1048:this.saveCursor();break;case 1049:this.saveCursor();case 47:case 1047:this._bufferService.buffers.activateAltBuffer(this._eraseAttrData()),this._coreService.isCursorInitialized=!0,this._onRequestRefreshRows.fire(0,this._bufferService.rows-1),this._onRequestSyncScrollBar.fire();break;case 2004:this._coreService.decPrivateModes.bracketedPasteMode=!0;}return !0},t.prototype.resetMode=function(e){for(var t=0;t<e.length;t++)4===e.params[t]&&(this._coreService.modes.insertMode=!1);return !0},t.prototype.resetModePrivate=function(e){for(var t=0;t<e.length;t++)switch(e.params[t]){case 1:this._coreService.decPrivateModes.applicationCursorKeys=!1;break;case 3:this._optionsService.rawOptions.windowOptions.setWinLines&&(this._bufferService.resize(80,this._bufferService.rows),this._onRequestReset.fire());break;case 6:this._coreService.decPrivateModes.origin=!1,this._setCursor(0,0);break;case 7:this._coreService.decPrivateModes.wraparound=!1;break;case 12:break;case 45:this._coreService.decPrivateModes.reverseWraparound=!1;break;case 66:this._logService.debug("Switching back to normal keypad."),this._coreService.decPrivateModes.applicationKeypad=!1,this._onRequestSyncScrollBar.fire();break;case 9:case 1e3:case 1002:case 1003:this._coreMouseService.activeProtocol="NONE";break;case 1004:this._coreService.decPrivateModes.sendFocus=!1;break;case 1005:this._logService.debug("DECRST 1005 not supported (see #2507)");break;case 1006:this._coreMouseService.activeEncoding="DEFAULT";break;case 1015:this._logService.debug("DECRST 1015 not supported (see #2507)");break;case 25:this._coreService.isCursorHidden=!0;break;case 1048:this.restoreCursor();break;case 1049:case 47:case 1047:this._bufferService.buffers.activateNormalBuffer(),1049===e.params[t]&&this.restoreCursor(),this._coreService.isCursorInitialized=!0,this._onRequestRefreshRows.fire(0,this._bufferService.rows-1),this._onRequestSyncScrollBar.fire();break;case 2004:this._coreService.decPrivateModes.bracketedPasteMode=!1;}return !0},t.prototype._updateAttrColor=function(e,t,r,i,n){return 2===t?(e|=50331648,e&=-16777216,e|=v.AttributeData.fromColorRGB([r,i,n])):5===t&&(e&=-50331904,e|=33554432|255&r),e},t.prototype._extractColor=function(e,t,r){var i=[0,0,-1,0,0,0],n=0,s=0;do{if(i[s+n]=e.params[t+s],e.hasSubParams(t+s)){var o=e.getSubParams(t+s),a=0;do{5===i[1]&&(n=1),i[s+a+1+n]=o[a];}while(++a<o.length&&a+s+1+n<i.length);break}if(5===i[1]&&s+n>=2||2===i[1]&&s+n>=5)break;i[1]&&(n=1);}while(++s+t<e.length&&s+n<i.length);for(a=2;a<i.length;++a)-1===i[a]&&(i[a]=0);switch(i[0]){case 38:r.fg=this._updateAttrColor(r.fg,i[1],i[3],i[4],i[5]);break;case 48:r.bg=this._updateAttrColor(r.bg,i[1],i[3],i[4],i[5]);break;case 58:r.extended=r.extended.clone(),r.extended.underlineColor=this._updateAttrColor(r.extended.underlineColor,i[1],i[3],i[4],i[5]);}return s},t.prototype._processUnderline=function(e,t){t.extended=t.extended.clone(),(!~e||e>5)&&(e=1),t.extended.underlineStyle=e,t.fg|=268435456,0===e&&(t.fg&=-268435457),t.updateExtended();},t.prototype.charAttributes=function(e){if(1===e.length&&0===e.params[0])return this._curAttrData.fg=l.DEFAULT_ATTR_DATA.fg,this._curAttrData.bg=l.DEFAULT_ATTR_DATA.bg,!0;for(var t,r=e.length,i=this._curAttrData,n=0;n<r;n++)(t=e.params[n])>=30&&t<=37?(i.fg&=-50331904,i.fg|=16777216|t-30):t>=40&&t<=47?(i.bg&=-50331904,i.bg|=16777216|t-40):t>=90&&t<=97?(i.fg&=-50331904,i.fg|=16777224|t-90):t>=100&&t<=107?(i.bg&=-50331904,i.bg|=16777224|t-100):0===t?(i.fg=l.DEFAULT_ATTR_DATA.fg,i.bg=l.DEFAULT_ATTR_DATA.bg):1===t?i.fg|=134217728:3===t?i.bg|=67108864:4===t?(i.fg|=268435456,this._processUnderline(e.hasSubParams(n)?e.getSubParams(n)[0]:1,i)):5===t?i.fg|=536870912:7===t?i.fg|=67108864:8===t?i.fg|=1073741824:9===t?i.fg|=2147483648:2===t?i.bg|=134217728:21===t?this._processUnderline(2,i):22===t?(i.fg&=-134217729,i.bg&=-134217729):23===t?i.bg&=-67108865:24===t?i.fg&=-268435457:25===t?i.fg&=-536870913:27===t?i.fg&=-67108865:28===t?i.fg&=-1073741825:29===t?i.fg&=2147483647:39===t?(i.fg&=-67108864,i.fg|=16777215&l.DEFAULT_ATTR_DATA.fg):49===t?(i.bg&=-67108864,i.bg|=16777215&l.DEFAULT_ATTR_DATA.bg):38===t||48===t||58===t?n+=this._extractColor(e,n,i):59===t?(i.extended=i.extended.clone(),i.extended.underlineColor=-1,i.updateExtended()):100===t?(i.fg&=-67108864,i.fg|=16777215&l.DEFAULT_ATTR_DATA.fg,i.bg&=-67108864,i.bg|=16777215&l.DEFAULT_ATTR_DATA.bg):this._logService.debug("Unknown SGR attribute: %d.",t);return !0},t.prototype.deviceStatus=function(e){switch(e.params[0]){case 5:this._coreService.triggerDataEvent(o.C0.ESC+"[0n");break;case 6:var t=this._activeBuffer.y+1,r=this._activeBuffer.x+1;this._coreService.triggerDataEvent(o.C0.ESC+"["+t+";"+r+"R");}return !0},t.prototype.deviceStatusPrivate=function(e){if(6===e.params[0]){var t=this._activeBuffer.y+1,r=this._activeBuffer.x+1;this._coreService.triggerDataEvent(o.C0.ESC+"[?"+t+";"+r+"R");}return !0},t.prototype.softReset=function(e){return this._coreService.isCursorHidden=!1,this._onRequestSyncScrollBar.fire(),this._activeBuffer.scrollTop=0,this._activeBuffer.scrollBottom=this._bufferService.rows-1,this._curAttrData=l.DEFAULT_ATTR_DATA.clone(),this._coreService.reset(),this._charsetService.reset(),this._activeBuffer.savedX=0,this._activeBuffer.savedY=this._activeBuffer.ybase,this._activeBuffer.savedCurAttrData.fg=this._curAttrData.fg,this._activeBuffer.savedCurAttrData.bg=this._curAttrData.bg,this._activeBuffer.savedCharset=this._charsetService.charset,this._coreService.decPrivateModes.origin=!1,!0},t.prototype.setCursorStyle=function(e){var t=e.params[0]||1;switch(t){case 1:case 2:this._optionsService.options.cursorStyle="block";break;case 3:case 4:this._optionsService.options.cursorStyle="underline";break;case 5:case 6:this._optionsService.options.cursorStyle="bar";}var r=t%2==1;return this._optionsService.options.cursorBlink=r,!0},t.prototype.setScrollRegion=function(e){var t,r=e.params[0]||1;return (e.length<2||(t=e.params[1])>this._bufferService.rows||0===t)&&(t=this._bufferService.rows),t>r&&(this._activeBuffer.scrollTop=r-1,this._activeBuffer.scrollBottom=t-1,this._setCursor(0,0)),!0},t.prototype.windowOptions=function(e){if(!w(e.params[0],this._optionsService.rawOptions.windowOptions))return !0;var t=e.length>1?e.params[1]:0;switch(e.params[0]){case 14:2!==t&&this._onRequestWindowsOptionsReport.fire(s.GET_WIN_SIZE_PIXELS);break;case 16:this._onRequestWindowsOptionsReport.fire(s.GET_CELL_SIZE_PIXELS);break;case 18:this._bufferService&&this._coreService.triggerDataEvent(o.C0.ESC+"[8;"+this._bufferService.rows+";"+this._bufferService.cols+"t");break;case 22:0!==t&&2!==t||(this._windowTitleStack.push(this._windowTitle),this._windowTitleStack.length>10&&this._windowTitleStack.shift()),0!==t&&1!==t||(this._iconNameStack.push(this._iconName),this._iconNameStack.length>10&&this._iconNameStack.shift());break;case 23:0!==t&&2!==t||this._windowTitleStack.length&&this.setTitle(this._windowTitleStack.pop()),0!==t&&1!==t||this._iconNameStack.length&&this.setIconName(this._iconNameStack.pop());}return !0},t.prototype.saveCursor=function(e){return this._activeBuffer.savedX=this._activeBuffer.x,this._activeBuffer.savedY=this._activeBuffer.ybase+this._activeBuffer.y,this._activeBuffer.savedCurAttrData.fg=this._curAttrData.fg,this._activeBuffer.savedCurAttrData.bg=this._curAttrData.bg,this._activeBuffer.savedCharset=this._charsetService.charset,!0},t.prototype.restoreCursor=function(e){return this._activeBuffer.x=this._activeBuffer.savedX||0,this._activeBuffer.y=Math.max(this._activeBuffer.savedY-this._activeBuffer.ybase,0),this._curAttrData.fg=this._activeBuffer.savedCurAttrData.fg,this._curAttrData.bg=this._activeBuffer.savedCurAttrData.bg,this._charsetService.charset=this._savedCharset,this._activeBuffer.savedCharset&&(this._charsetService.charset=this._activeBuffer.savedCharset),this._restrictCursor(),!0},t.prototype.setTitle=function(e){return this._windowTitle=e,this._onTitleChange.fire(e),!0},t.prototype.setIconName=function(e){return this._iconName=e,!0},t.prototype.setOrReportIndexedColor=function(e){for(var t=[],r=e.split(";");r.length>1;){var i=r.shift(),n=r.shift();if(/^\d+$/.exec(i)){var s=parseInt(i);if(0<=s&&s<256)if("?"===n)t.push({type:0,index:s});else {var o=(0, S.parseColor)(n);o&&t.push({type:1,index:s,color:o});}}}return t.length&&this._onColor.fire(t),!0},t.prototype._setOrReportSpecialColor=function(e,t){for(var r=e.split(";"),i=0;i<r.length&&!(t>=this._specialColors.length);++i,++t)if("?"===r[i])this._onColor.fire([{type:0,index:this._specialColors[t]}]);else {var n=(0, S.parseColor)(r[i]);n&&this._onColor.fire([{type:1,index:this._specialColors[t],color:n}]);}return !0},t.prototype.setOrReportFgColor=function(e){return this._setOrReportSpecialColor(e,0)},t.prototype.setOrReportBgColor=function(e){return this._setOrReportSpecialColor(e,1)},t.prototype.setOrReportCursorColor=function(e){return this._setOrReportSpecialColor(e,2)},t.prototype.restoreIndexedColor=function(e){if(!e)return this._onColor.fire([{type:2}]),!0;for(var t=[],r=e.split(";"),i=0;i<r.length;++i)if(/^\d+$/.exec(r[i])){var n=parseInt(r[i]);0<=n&&n<256&&t.push({type:2,index:n});}return t.length&&this._onColor.fire(t),!0},t.prototype.restoreFgColor=function(e){return this._onColor.fire([{type:2,index:256}]),!0},t.prototype.restoreBgColor=function(e){return this._onColor.fire([{type:2,index:257}]),!0},t.prototype.restoreCursorColor=function(e){return this._onColor.fire([{type:2,index:258}]),!0},t.prototype.nextLine=function(){return this._activeBuffer.x=0,this.index(),!0},t.prototype.keypadApplicationMode=function(){return this._logService.debug("Serial port requested application keypad."),this._coreService.decPrivateModes.applicationKeypad=!0,this._onRequestSyncScrollBar.fire(),!0},t.prototype.keypadNumericMode=function(){return this._logService.debug("Switching back to normal keypad."),this._coreService.decPrivateModes.applicationKeypad=!1,this._onRequestSyncScrollBar.fire(),!0},t.prototype.selectDefaultCharset=function(){return this._charsetService.setgLevel(0),this._charsetService.setgCharset(0,a.DEFAULT_CHARSET),!0},t.prototype.selectCharset=function(e){return 2!==e.length?(this.selectDefaultCharset(),!0):("/"===e[0]||this._charsetService.setgCharset(m[e[0]],a.CHARSETS[e[1]]||a.DEFAULT_CHARSET),!0)},t.prototype.index=function(){return this._restrictCursor(),this._activeBuffer.y++,this._activeBuffer.y===this._activeBuffer.scrollBottom+1?(this._activeBuffer.y--,this._bufferService.scroll(this._eraseAttrData())):this._activeBuffer.y>=this._bufferService.rows&&(this._activeBuffer.y=this._bufferService.rows-1),this._restrictCursor(),!0},t.prototype.tabSet=function(){return this._activeBuffer.tabs[this._activeBuffer.x]=!0,!0},t.prototype.reverseIndex=function(){if(this._restrictCursor(),this._activeBuffer.y===this._activeBuffer.scrollTop){var e=this._activeBuffer.scrollBottom-this._activeBuffer.scrollTop;this._activeBuffer.lines.shiftElements(this._activeBuffer.ybase+this._activeBuffer.y,e,1),this._activeBuffer.lines.set(this._activeBuffer.ybase+this._activeBuffer.y,this._activeBuffer.getBlankLine(this._eraseAttrData())),this._dirtyRowService.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom);}else this._activeBuffer.y--,this._restrictCursor();return !0},t.prototype.fullReset=function(){return this._parser.reset(),this._onRequestReset.fire(),!0},t.prototype.reset=function(){this._curAttrData=l.DEFAULT_ATTR_DATA.clone(),this._eraseAttrDataInternal=l.DEFAULT_ATTR_DATA.clone();},t.prototype._eraseAttrData=function(){return this._eraseAttrDataInternal.bg&=-67108864,this._eraseAttrDataInternal.bg|=67108863&this._curAttrData.bg,this._eraseAttrDataInternal},t.prototype.setgLevel=function(e){return this._charsetService.setgLevel(e),!0},t.prototype.screenAlignmentPattern=function(){var e=new d.CellData;e.content=1<<22|"E".charCodeAt(0),e.fg=this._curAttrData.fg,e.bg=this._curAttrData.bg,this._setCursor(0,0);for(var t=0;t<this._bufferService.rows;++t){var r=this._activeBuffer.ybase+this._activeBuffer.y+t,i=this._activeBuffer.lines.get(r);i&&(i.fill(e),i.isWrapped=!1);}return this._dirtyRowService.markAllDirty(),this._setCursor(0,0),!0},t}(f.Disposable);t.InputHandler=E;},844:function(e,t){var r=this&&this.__values||function(e){var t="function"==typeof Symbol&&Symbol.iterator,r=t&&e[t],i=0;if(r)return r.call(e);if(e&&"number"==typeof e.length)return {next:function(){return e&&i>=e.length&&(e=void 0),{value:e&&e[i++],done:!e}}};throw new TypeError(t?"Object is not iterable.":"Symbol.iterator is not defined.")};Object.defineProperty(t,"__esModule",{value:!0}),t.getDisposeArrayDisposable=t.disposeArray=t.Disposable=void 0;var i=function(){function e(){this._disposables=[],this._isDisposed=!1;}return e.prototype.dispose=function(){var e,t;this._isDisposed=!0;try{for(var i=r(this._disposables),n=i.next();!n.done;n=i.next())n.value.dispose();}catch(t){e={error:t};}finally{try{n&&!n.done&&(t=i.return)&&t.call(i);}finally{if(e)throw e.error}}this._disposables.length=0;},e.prototype.register=function(e){return this._disposables.push(e),e},e.prototype.unregister=function(e){var t=this._disposables.indexOf(e);-1!==t&&this._disposables.splice(t,1);},e}();function n(e){var t,i;try{for(var n=r(e),s=n.next();!s.done;s=n.next())s.value.dispose();}catch(e){t={error:e};}finally{try{s&&!s.done&&(i=n.return)&&i.call(n);}finally{if(t)throw t.error}}e.length=0;}t.Disposable=i,t.disposeArray=n,t.getDisposeArrayDisposable=function(e){return {dispose:function(){return n(e)}}};},114:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.isLinux=t.isWindows=t.isIphone=t.isIpad=t.isMac=t.isSafari=t.isLegacyEdge=t.isFirefox=void 0;var r="undefined"==typeof navigator,i=r?"node":navigator.userAgent,n=r?"node":navigator.platform;t.isFirefox=i.includes("Firefox"),t.isLegacyEdge=i.includes("Edge"),t.isSafari=/^((?!chrome|android).)*safari/i.test(i),t.isMac=["Macintosh","MacIntel","MacPPC","Mac68K"].includes(n),t.isIpad="iPad"===n,t.isIphone="iPhone"===n,t.isWindows=["Windows","Win16","Win32","WinCE"].includes(n),t.isLinux=n.indexOf("Linux")>=0;},273:(e,t)=>{function r(e,t,r,i){if(void 0===r&&(r=0),void 0===i&&(i=e.length),r>=e.length)return e;r=(e.length+r)%e.length,i=i>=e.length?e.length:(e.length+i)%e.length;for(var n=r;n<i;++n)e[n]=t;return e}Object.defineProperty(t,"__esModule",{value:!0}),t.concat=t.fillFallback=t.fill=void 0,t.fill=function(e,t,i,n){return e.fill?e.fill(t,i,n):r(e,t,i,n)},t.fillFallback=r,t.concat=function(e,t){var r=new e.constructor(e.length+t.length);return r.set(e),r.set(t,e.length),r};},282:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.updateWindowsModeWrappedState=void 0;var i=r(643);t.updateWindowsModeWrappedState=function(e){var t=e.buffer.lines.get(e.buffer.ybase+e.buffer.y-1),r=null==t?void 0:t.get(e.cols-1),n=e.buffer.lines.get(e.buffer.ybase+e.buffer.y);n&&r&&(n.isWrapped=r[i.CHAR_DATA_CODE_INDEX]!==i.NULL_CELL_CODE&&r[i.CHAR_DATA_CODE_INDEX]!==i.WHITESPACE_CELL_CODE);};},734:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.ExtendedAttrs=t.AttributeData=void 0;var r=function(){function e(){this.fg=0,this.bg=0,this.extended=new i;}return e.toColorRGB=function(e){return [e>>>16&255,e>>>8&255,255&e]},e.fromColorRGB=function(e){return (255&e[0])<<16|(255&e[1])<<8|255&e[2]},e.prototype.clone=function(){var t=new e;return t.fg=this.fg,t.bg=this.bg,t.extended=this.extended.clone(),t},e.prototype.isInverse=function(){return 67108864&this.fg},e.prototype.isBold=function(){return 134217728&this.fg},e.prototype.isUnderline=function(){return 268435456&this.fg},e.prototype.isBlink=function(){return 536870912&this.fg},e.prototype.isInvisible=function(){return 1073741824&this.fg},e.prototype.isItalic=function(){return 67108864&this.bg},e.prototype.isDim=function(){return 134217728&this.bg},e.prototype.isStrikethrough=function(){return 2147483648&this.fg},e.prototype.getFgColorMode=function(){return 50331648&this.fg},e.prototype.getBgColorMode=function(){return 50331648&this.bg},e.prototype.isFgRGB=function(){return 50331648==(50331648&this.fg)},e.prototype.isBgRGB=function(){return 50331648==(50331648&this.bg)},e.prototype.isFgPalette=function(){return 16777216==(50331648&this.fg)||33554432==(50331648&this.fg)},e.prototype.isBgPalette=function(){return 16777216==(50331648&this.bg)||33554432==(50331648&this.bg)},e.prototype.isFgDefault=function(){return 0==(50331648&this.fg)},e.prototype.isBgDefault=function(){return 0==(50331648&this.bg)},e.prototype.isAttributeDefault=function(){return 0===this.fg&&0===this.bg},e.prototype.getFgColor=function(){switch(50331648&this.fg){case 16777216:case 33554432:return 255&this.fg;case 50331648:return 16777215&this.fg;default:return -1}},e.prototype.getBgColor=function(){switch(50331648&this.bg){case 16777216:case 33554432:return 255&this.bg;case 50331648:return 16777215&this.bg;default:return -1}},e.prototype.hasExtendedAttrs=function(){return 268435456&this.bg},e.prototype.updateExtended=function(){this.extended.isEmpty()?this.bg&=-268435457:this.bg|=268435456;},e.prototype.getUnderlineColor=function(){if(268435456&this.bg&&~this.extended.underlineColor)switch(50331648&this.extended.underlineColor){case 16777216:case 33554432:return 255&this.extended.underlineColor;case 50331648:return 16777215&this.extended.underlineColor;default:return this.getFgColor()}return this.getFgColor()},e.prototype.getUnderlineColorMode=function(){return 268435456&this.bg&&~this.extended.underlineColor?50331648&this.extended.underlineColor:this.getFgColorMode()},e.prototype.isUnderlineColorRGB=function(){return 268435456&this.bg&&~this.extended.underlineColor?50331648==(50331648&this.extended.underlineColor):this.isFgRGB()},e.prototype.isUnderlineColorPalette=function(){return 268435456&this.bg&&~this.extended.underlineColor?16777216==(50331648&this.extended.underlineColor)||33554432==(50331648&this.extended.underlineColor):this.isFgPalette()},e.prototype.isUnderlineColorDefault=function(){return 268435456&this.bg&&~this.extended.underlineColor?0==(50331648&this.extended.underlineColor):this.isFgDefault()},e.prototype.getUnderlineStyle=function(){return 268435456&this.fg?268435456&this.bg?this.extended.underlineStyle:1:0},e}();t.AttributeData=r;var i=function(){function e(e,t){void 0===e&&(e=0),void 0===t&&(t=-1),this.underlineStyle=e,this.underlineColor=t;}return e.prototype.clone=function(){return new e(this.underlineStyle,this.underlineColor)},e.prototype.isEmpty=function(){return 0===this.underlineStyle},e}();t.ExtendedAttrs=i;},92:function(e,t,r){var i=this&&this.__read||function(e,t){var r="function"==typeof Symbol&&e[Symbol.iterator];if(!r)return e;var i,n,s=r.call(e),o=[];try{for(;(void 0===t||t-- >0)&&!(i=s.next()).done;)o.push(i.value);}catch(e){n={error:e};}finally{try{i&&!i.done&&(r=s.return)&&r.call(s);}finally{if(n)throw n.error}}return o},n=this&&this.__spreadArray||function(e,t,r){if(r||2===arguments.length)for(var i,n=0,s=t.length;n<s;n++)!i&&n in t||(i||(i=Array.prototype.slice.call(t,0,n)),i[n]=t[n]);return e.concat(i||Array.prototype.slice.call(t))};Object.defineProperty(t,"__esModule",{value:!0}),t.BufferStringIterator=t.Buffer=t.MAX_BUFFER_SIZE=void 0;var s=r(349),o=r(437),a=r(511),c=r(643),f=r(634),u=r(863),h=r(116),l=r(734);t.MAX_BUFFER_SIZE=4294967295;var p=function(){function e(e,t,r){this._hasScrollback=e,this._optionsService=t,this._bufferService=r,this.ydisp=0,this.ybase=0,this.y=0,this.x=0,this.savedY=0,this.savedX=0,this.savedCurAttrData=o.DEFAULT_ATTR_DATA.clone(),this.savedCharset=h.DEFAULT_CHARSET,this.markers=[],this._nullCell=a.CellData.fromCharData([0,c.NULL_CELL_CHAR,c.NULL_CELL_WIDTH,c.NULL_CELL_CODE]),this._whitespaceCell=a.CellData.fromCharData([0,c.WHITESPACE_CELL_CHAR,c.WHITESPACE_CELL_WIDTH,c.WHITESPACE_CELL_CODE]),this._isClearing=!1,this._cols=this._bufferService.cols,this._rows=this._bufferService.rows,this.lines=new s.CircularList(this._getCorrectBufferLength(this._rows)),this.scrollTop=0,this.scrollBottom=this._rows-1,this.setupTabStops();}return e.prototype.getNullCell=function(e){return e?(this._nullCell.fg=e.fg,this._nullCell.bg=e.bg,this._nullCell.extended=e.extended):(this._nullCell.fg=0,this._nullCell.bg=0,this._nullCell.extended=new l.ExtendedAttrs),this._nullCell},e.prototype.getWhitespaceCell=function(e){return e?(this._whitespaceCell.fg=e.fg,this._whitespaceCell.bg=e.bg,this._whitespaceCell.extended=e.extended):(this._whitespaceCell.fg=0,this._whitespaceCell.bg=0,this._whitespaceCell.extended=new l.ExtendedAttrs),this._whitespaceCell},e.prototype.getBlankLine=function(e,t){return new o.BufferLine(this._bufferService.cols,this.getNullCell(e),t)},Object.defineProperty(e.prototype,"hasScrollback",{get:function(){return this._hasScrollback&&this.lines.maxLength>this._rows},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"isCursorInViewport",{get:function(){var e=this.ybase+this.y-this.ydisp;return e>=0&&e<this._rows},enumerable:!1,configurable:!0}),e.prototype._getCorrectBufferLength=function(e){if(!this._hasScrollback)return e;var r=e+this._optionsService.rawOptions.scrollback;return r>t.MAX_BUFFER_SIZE?t.MAX_BUFFER_SIZE:r},e.prototype.fillViewportRows=function(e){if(0===this.lines.length){void 0===e&&(e=o.DEFAULT_ATTR_DATA);for(var t=this._rows;t--;)this.lines.push(this.getBlankLine(e));}},e.prototype.clear=function(){this.ydisp=0,this.ybase=0,this.y=0,this.x=0,this.lines=new s.CircularList(this._getCorrectBufferLength(this._rows)),this.scrollTop=0,this.scrollBottom=this._rows-1,this.setupTabStops();},e.prototype.resize=function(e,t){var r=this.getNullCell(o.DEFAULT_ATTR_DATA),i=this._getCorrectBufferLength(t);if(i>this.lines.maxLength&&(this.lines.maxLength=i),this.lines.length>0){if(this._cols<e)for(var n=0;n<this.lines.length;n++)this.lines.get(n).resize(e,r);var s=0;if(this._rows<t)for(var a=this._rows;a<t;a++)this.lines.length<t+this.ybase&&(this._optionsService.rawOptions.windowsMode?this.lines.push(new o.BufferLine(e,r)):this.ybase>0&&this.lines.length<=this.ybase+this.y+s+1?(this.ybase--,s++,this.ydisp>0&&this.ydisp--):this.lines.push(new o.BufferLine(e,r)));else for(a=this._rows;a>t;a--)this.lines.length>t+this.ybase&&(this.lines.length>this.ybase+this.y+1?this.lines.pop():(this.ybase++,this.ydisp++));if(i<this.lines.maxLength){var c=this.lines.length-i;c>0&&(this.lines.trimStart(c),this.ybase=Math.max(this.ybase-c,0),this.ydisp=Math.max(this.ydisp-c,0),this.savedY=Math.max(this.savedY-c,0)),this.lines.maxLength=i;}this.x=Math.min(this.x,e-1),this.y=Math.min(this.y,t-1),s&&(this.y+=s),this.savedX=Math.min(this.savedX,e-1),this.scrollTop=0;}if(this.scrollBottom=t-1,this._isReflowEnabled&&(this._reflow(e,t),this._cols>e))for(n=0;n<this.lines.length;n++)this.lines.get(n).resize(e,r);this._cols=e,this._rows=t;},Object.defineProperty(e.prototype,"_isReflowEnabled",{get:function(){return this._hasScrollback&&!this._optionsService.rawOptions.windowsMode},enumerable:!1,configurable:!0}),e.prototype._reflow=function(e,t){this._cols!==e&&(e>this._cols?this._reflowLarger(e,t):this._reflowSmaller(e,t));},e.prototype._reflowLarger=function(e,t){var r=(0, f.reflowLargerGetLinesToRemove)(this.lines,this._cols,e,this.ybase+this.y,this.getNullCell(o.DEFAULT_ATTR_DATA));if(r.length>0){var i=(0, f.reflowLargerCreateNewLayout)(this.lines,r);(0, f.reflowLargerApplyNewLayout)(this.lines,i.layout),this._reflowLargerAdjustViewport(e,t,i.countRemoved);}},e.prototype._reflowLargerAdjustViewport=function(e,t,r){for(var i=this.getNullCell(o.DEFAULT_ATTR_DATA),n=r;n-- >0;)0===this.ybase?(this.y>0&&this.y--,this.lines.length<t&&this.lines.push(new o.BufferLine(e,i))):(this.ydisp===this.ybase&&this.ydisp--,this.ybase--);this.savedY=Math.max(this.savedY-r,0);},e.prototype._reflowSmaller=function(e,t){for(var r=this.getNullCell(o.DEFAULT_ATTR_DATA),s=[],a=0,c=this.lines.length-1;c>=0;c--){var u=this.lines.get(c);if(!(!u||!u.isWrapped&&u.getTrimmedLength()<=e)){for(var h=[u];u.isWrapped&&c>0;)u=this.lines.get(--c),h.unshift(u);var l=this.ybase+this.y;if(!(l>=c&&l<c+h.length)){var p,_=h[h.length-1].getTrimmedLength(),d=(0, f.reflowSmallerGetNewLineLengths)(h,this._cols,e),v=d.length-h.length;p=0===this.ybase&&this.y!==this.lines.length-1?Math.max(0,this.y-this.lines.maxLength+v):Math.max(0,this.lines.length-this.lines.maxLength+v);for(var g=[],y=0;y<v;y++){var b=this.getBlankLine(o.DEFAULT_ATTR_DATA,!0);g.push(b);}g.length>0&&(s.push({start:c+h.length+a,newLines:g}),a+=g.length),h.push.apply(h,n([],i(g),!1));var S=d.length-1,m=d[S];0===m&&(m=d[--S]);for(var C=h.length-v-1,w=_;C>=0;){var A=Math.min(w,m);if(void 0===h[S])break;if(h[S].copyCellsFrom(h[C],w-A,m-A,A,!0),0==(m-=A)&&(m=d[--S]),0==(w-=A)){C--;var E=Math.max(C,0);w=(0, f.getWrappedLineTrimmedLength)(h,E,this._cols);}}for(y=0;y<h.length;y++)d[y]<e&&h[y].setCell(d[y],r);for(var B=v-p;B-- >0;)0===this.ybase?this.y<t-1?(this.y++,this.lines.pop()):(this.ybase++,this.ydisp++):this.ybase<Math.min(this.lines.maxLength,this.lines.length+a)-t&&(this.ybase===this.ydisp&&this.ydisp++,this.ybase++);this.savedY=Math.min(this.savedY+v,this.ybase+t-1);}}}if(s.length>0){var P=[],O=[];for(y=0;y<this.lines.length;y++)O.push(this.lines.get(y));var T=this.lines.length,D=T-1,L=0,x=s[L];this.lines.length=Math.min(this.lines.maxLength,this.lines.length+a);var k=0;for(y=Math.min(this.lines.maxLength-1,T+a-1);y>=0;y--)if(x&&x.start>D+k){for(var H=x.newLines.length-1;H>=0;H--)this.lines.set(y--,x.newLines[H]);y++,P.push({index:D+1,amount:x.newLines.length}),k+=x.newLines.length,x=s[++L];}else this.lines.set(y,O[D--]);var R=0;for(y=P.length-1;y>=0;y--)P[y].index+=R,this.lines.onInsertEmitter.fire(P[y]),R+=P[y].amount;var M=Math.max(0,T+a-this.lines.maxLength);M>0&&this.lines.onTrimEmitter.fire(M);}},e.prototype.stringIndexToBufferIndex=function(e,t,r){for(void 0===r&&(r=!1);t;){var i=this.lines.get(e);if(!i)return [-1,-1];for(var n=r?i.getTrimmedLength():i.length,s=0;s<n;++s)if(i.get(s)[c.CHAR_DATA_WIDTH_INDEX]&&(t-=i.get(s)[c.CHAR_DATA_CHAR_INDEX].length||1),t<0)return [e,s];e++;}return [e,0]},e.prototype.translateBufferLineToString=function(e,t,r,i){void 0===r&&(r=0);var n=this.lines.get(e);return n?n.translateToString(t,r,i):""},e.prototype.getWrappedRangeForLine=function(e){for(var t=e,r=e;t>0&&this.lines.get(t).isWrapped;)t--;for(;r+1<this.lines.length&&this.lines.get(r+1).isWrapped;)r++;return {first:t,last:r}},e.prototype.setupTabStops=function(e){for(null!=e?this.tabs[e]||(e=this.prevStop(e)):(this.tabs={},e=0);e<this._cols;e+=this._optionsService.rawOptions.tabStopWidth)this.tabs[e]=!0;},e.prototype.prevStop=function(e){for(null==e&&(e=this.x);!this.tabs[--e]&&e>0;);return e>=this._cols?this._cols-1:e<0?0:e},e.prototype.nextStop=function(e){for(null==e&&(e=this.x);!this.tabs[++e]&&e<this._cols;);return e>=this._cols?this._cols-1:e<0?0:e},e.prototype.clearMarkers=function(e){this._isClearing=!0;for(var t=0;t<this.markers.length;t++)this.markers[t].line===e&&(this.markers[t].dispose(),this.markers.splice(t--,1));this._isClearing=!1;},e.prototype.clearAllMarkers=function(){this._isClearing=!0;for(var e=0;e<this.markers.length;e++)this.markers[e].dispose(),this.markers.splice(e--,1);this._isClearing=!1;},e.prototype.addMarker=function(e){var t=this,r=new u.Marker(e);return this.markers.push(r),r.register(this.lines.onTrim((function(e){r.line-=e,r.line<0&&r.dispose();}))),r.register(this.lines.onInsert((function(e){r.line>=e.index&&(r.line+=e.amount);}))),r.register(this.lines.onDelete((function(e){r.line>=e.index&&r.line<e.index+e.amount&&r.dispose(),r.line>e.index&&(r.line-=e.amount);}))),r.register(r.onDispose((function(){return t._removeMarker(r)}))),r},e.prototype._removeMarker=function(e){this._isClearing||this.markers.splice(this.markers.indexOf(e),1);},e.prototype.iterator=function(e,t,r,i,n){return new _(this,e,t,r,i,n)},e}();t.Buffer=p;var _=function(){function e(e,t,r,i,n,s){void 0===r&&(r=0),void 0===i&&(i=e.lines.length),void 0===n&&(n=0),void 0===s&&(s=0),this._buffer=e,this._trimRight=t,this._startIndex=r,this._endIndex=i,this._startOverscan=n,this._endOverscan=s,this._startIndex<0&&(this._startIndex=0),this._endIndex>this._buffer.lines.length&&(this._endIndex=this._buffer.lines.length),this._current=this._startIndex;}return e.prototype.hasNext=function(){return this._current<this._endIndex},e.prototype.next=function(){var e=this._buffer.getWrappedRangeForLine(this._current);e.first<this._startIndex-this._startOverscan&&(e.first=this._startIndex-this._startOverscan),e.last>this._endIndex+this._endOverscan&&(e.last=this._endIndex+this._endOverscan),e.first=Math.max(e.first,0),e.last=Math.min(e.last,this._buffer.lines.length);for(var t="",r=e.first;r<=e.last;++r)t+=this._buffer.translateBufferLineToString(r,this._trimRight);return this._current=e.last+1,{range:e,content:t}},e}();t.BufferStringIterator=_;},437:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.BufferLine=t.DEFAULT_ATTR_DATA=void 0;var i=r(482),n=r(643),s=r(511),o=r(734);t.DEFAULT_ATTR_DATA=Object.freeze(new o.AttributeData);var a=function(){function e(e,t,r){void 0===r&&(r=!1),this.isWrapped=r,this._combined={},this._extendedAttrs={},this._data=new Uint32Array(3*e);for(var i=t||s.CellData.fromCharData([0,n.NULL_CELL_CHAR,n.NULL_CELL_WIDTH,n.NULL_CELL_CODE]),o=0;o<e;++o)this.setCell(o,i);this.length=e;}return e.prototype.get=function(e){var t=this._data[3*e+0],r=2097151&t;return [this._data[3*e+1],2097152&t?this._combined[e]:r?(0, i.stringFromCodePoint)(r):"",t>>22,2097152&t?this._combined[e].charCodeAt(this._combined[e].length-1):r]},e.prototype.set=function(e,t){this._data[3*e+1]=t[n.CHAR_DATA_ATTR_INDEX],t[n.CHAR_DATA_CHAR_INDEX].length>1?(this._combined[e]=t[1],this._data[3*e+0]=2097152|e|t[n.CHAR_DATA_WIDTH_INDEX]<<22):this._data[3*e+0]=t[n.CHAR_DATA_CHAR_INDEX].charCodeAt(0)|t[n.CHAR_DATA_WIDTH_INDEX]<<22;},e.prototype.getWidth=function(e){return this._data[3*e+0]>>22},e.prototype.hasWidth=function(e){return 12582912&this._data[3*e+0]},e.prototype.getFg=function(e){return this._data[3*e+1]},e.prototype.getBg=function(e){return this._data[3*e+2]},e.prototype.hasContent=function(e){return 4194303&this._data[3*e+0]},e.prototype.getCodePoint=function(e){var t=this._data[3*e+0];return 2097152&t?this._combined[e].charCodeAt(this._combined[e].length-1):2097151&t},e.prototype.isCombined=function(e){return 2097152&this._data[3*e+0]},e.prototype.getString=function(e){var t=this._data[3*e+0];return 2097152&t?this._combined[e]:2097151&t?(0, i.stringFromCodePoint)(2097151&t):""},e.prototype.loadCell=function(e,t){var r=3*e;return t.content=this._data[r+0],t.fg=this._data[r+1],t.bg=this._data[r+2],2097152&t.content&&(t.combinedData=this._combined[e]),268435456&t.bg&&(t.extended=this._extendedAttrs[e]),t},e.prototype.setCell=function(e,t){2097152&t.content&&(this._combined[e]=t.combinedData),268435456&t.bg&&(this._extendedAttrs[e]=t.extended),this._data[3*e+0]=t.content,this._data[3*e+1]=t.fg,this._data[3*e+2]=t.bg;},e.prototype.setCellFromCodePoint=function(e,t,r,i,n,s){268435456&n&&(this._extendedAttrs[e]=s),this._data[3*e+0]=t|r<<22,this._data[3*e+1]=i,this._data[3*e+2]=n;},e.prototype.addCodepointToCell=function(e,t){var r=this._data[3*e+0];2097152&r?this._combined[e]+=(0, i.stringFromCodePoint)(t):(2097151&r?(this._combined[e]=(0, i.stringFromCodePoint)(2097151&r)+(0, i.stringFromCodePoint)(t),r&=-2097152,r|=2097152):r=t|1<<22,this._data[3*e+0]=r);},e.prototype.insertCells=function(e,t,r,i){if((e%=this.length)&&2===this.getWidth(e-1)&&this.setCellFromCodePoint(e-1,0,1,(null==i?void 0:i.fg)||0,(null==i?void 0:i.bg)||0,(null==i?void 0:i.extended)||new o.ExtendedAttrs),t<this.length-e){for(var n=new s.CellData,a=this.length-e-t-1;a>=0;--a)this.setCell(e+t+a,this.loadCell(e+a,n));for(a=0;a<t;++a)this.setCell(e+a,r);}else for(a=e;a<this.length;++a)this.setCell(a,r);2===this.getWidth(this.length-1)&&this.setCellFromCodePoint(this.length-1,0,1,(null==i?void 0:i.fg)||0,(null==i?void 0:i.bg)||0,(null==i?void 0:i.extended)||new o.ExtendedAttrs);},e.prototype.deleteCells=function(e,t,r,i){if(e%=this.length,t<this.length-e){for(var n=new s.CellData,a=0;a<this.length-e-t;++a)this.setCell(e+a,this.loadCell(e+t+a,n));for(a=this.length-t;a<this.length;++a)this.setCell(a,r);}else for(a=e;a<this.length;++a)this.setCell(a,r);e&&2===this.getWidth(e-1)&&this.setCellFromCodePoint(e-1,0,1,(null==i?void 0:i.fg)||0,(null==i?void 0:i.bg)||0,(null==i?void 0:i.extended)||new o.ExtendedAttrs),0!==this.getWidth(e)||this.hasContent(e)||this.setCellFromCodePoint(e,0,1,(null==i?void 0:i.fg)||0,(null==i?void 0:i.bg)||0,(null==i?void 0:i.extended)||new o.ExtendedAttrs);},e.prototype.replaceCells=function(e,t,r,i){for(e&&2===this.getWidth(e-1)&&this.setCellFromCodePoint(e-1,0,1,(null==i?void 0:i.fg)||0,(null==i?void 0:i.bg)||0,(null==i?void 0:i.extended)||new o.ExtendedAttrs),t<this.length&&2===this.getWidth(t-1)&&this.setCellFromCodePoint(t,0,1,(null==i?void 0:i.fg)||0,(null==i?void 0:i.bg)||0,(null==i?void 0:i.extended)||new o.ExtendedAttrs);e<t&&e<this.length;)this.setCell(e++,r);},e.prototype.resize=function(e,t){if(e!==this.length){if(e>this.length){var r=new Uint32Array(3*e);this.length&&(3*e<this._data.length?r.set(this._data.subarray(0,3*e)):r.set(this._data)),this._data=r;for(var i=this.length;i<e;++i)this.setCell(i,t);}else if(e){(r=new Uint32Array(3*e)).set(this._data.subarray(0,3*e)),this._data=r;var n=Object.keys(this._combined);for(i=0;i<n.length;i++){var s=parseInt(n[i],10);s>=e&&delete this._combined[s];}}else this._data=new Uint32Array(0),this._combined={};this.length=e;}},e.prototype.fill=function(e){this._combined={},this._extendedAttrs={};for(var t=0;t<this.length;++t)this.setCell(t,e);},e.prototype.copyFrom=function(e){for(var t in this.length!==e.length?this._data=new Uint32Array(e._data):this._data.set(e._data),this.length=e.length,this._combined={},e._combined)this._combined[t]=e._combined[t];for(var t in this._extendedAttrs={},e._extendedAttrs)this._extendedAttrs[t]=e._extendedAttrs[t];this.isWrapped=e.isWrapped;},e.prototype.clone=function(){var t=new e(0);for(var r in t._data=new Uint32Array(this._data),t.length=this.length,this._combined)t._combined[r]=this._combined[r];for(var r in this._extendedAttrs)t._extendedAttrs[r]=this._extendedAttrs[r];return t.isWrapped=this.isWrapped,t},e.prototype.getTrimmedLength=function(){for(var e=this.length-1;e>=0;--e)if(4194303&this._data[3*e+0])return e+(this._data[3*e+0]>>22);return 0},e.prototype.copyCellsFrom=function(e,t,r,i,n){var s=e._data;if(n)for(var o=i-1;o>=0;o--)for(var a=0;a<3;a++)this._data[3*(r+o)+a]=s[3*(t+o)+a];else for(o=0;o<i;o++)for(a=0;a<3;a++)this._data[3*(r+o)+a]=s[3*(t+o)+a];var c=Object.keys(e._combined);for(a=0;a<c.length;a++){var f=parseInt(c[a],10);f>=t&&(this._combined[f-t+r]=e._combined[f]);}},e.prototype.translateToString=function(e,t,r){void 0===e&&(e=!1),void 0===t&&(t=0),void 0===r&&(r=this.length),e&&(r=Math.min(r,this.getTrimmedLength()));for(var s="";t<r;){var o=this._data[3*t+0],a=2097151&o;s+=2097152&o?this._combined[t]:a?(0, i.stringFromCodePoint)(a):n.WHITESPACE_CELL_CHAR,t+=o>>22||1;}return s},e}();t.BufferLine=a;},634:(e,t)=>{function r(e,t,r){if(t===e.length-1)return e[t].getTrimmedLength();var i=!e[t].hasContent(r-1)&&1===e[t].getWidth(r-1),n=2===e[t+1].getWidth(0);return i&&n?r-1:r}Object.defineProperty(t,"__esModule",{value:!0}),t.getWrappedLineTrimmedLength=t.reflowSmallerGetNewLineLengths=t.reflowLargerApplyNewLayout=t.reflowLargerCreateNewLayout=t.reflowLargerGetLinesToRemove=void 0,t.reflowLargerGetLinesToRemove=function(e,t,i,n,s){for(var o=[],a=0;a<e.length-1;a++){var c=a,f=e.get(++c);if(f.isWrapped){for(var u=[e.get(a)];c<e.length&&f.isWrapped;)u.push(f),f=e.get(++c);if(n>=a&&n<c)a+=u.length-1;else {for(var h=0,l=r(u,h,t),p=1,_=0;p<u.length;){var d=r(u,p,t),v=d-_,g=i-l,y=Math.min(v,g);u[h].copyCellsFrom(u[p],_,l,y,!1),(l+=y)===i&&(h++,l=0),(_+=y)===d&&(p++,_=0),0===l&&0!==h&&2===u[h-1].getWidth(i-1)&&(u[h].copyCellsFrom(u[h-1],i-1,l++,1,!1),u[h-1].setCell(i-1,s));}u[h].replaceCells(l,i,s);for(var b=0,S=u.length-1;S>0&&(S>h||0===u[S].getTrimmedLength());S--)b++;b>0&&(o.push(a+u.length-b),o.push(b)),a+=u.length-1;}}}return o},t.reflowLargerCreateNewLayout=function(e,t){for(var r=[],i=0,n=t[i],s=0,o=0;o<e.length;o++)if(n===o){var a=t[++i];e.onDeleteEmitter.fire({index:o-s,amount:a}),o+=a-1,s+=a,n=t[++i];}else r.push(o);return {layout:r,countRemoved:s}},t.reflowLargerApplyNewLayout=function(e,t){for(var r=[],i=0;i<t.length;i++)r.push(e.get(t[i]));for(i=0;i<r.length;i++)e.set(i,r[i]);e.length=t.length;},t.reflowSmallerGetNewLineLengths=function(e,t,i){for(var n=[],s=e.map((function(i,n){return r(e,n,t)})).reduce((function(e,t){return e+t})),o=0,a=0,c=0;c<s;){if(s-c<i){n.push(s-c);break}o+=i;var f=r(e,a,t);o>f&&(o-=f,a++);var u=2===e[a].getWidth(o-1);u&&o--;var h=u?i-1:i;n.push(h),c+=h;}return n},t.getWrappedLineTrimmedLength=r;},295:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);});Object.defineProperty(t,"__esModule",{value:!0}),t.BufferSet=void 0;var s=r(92),o=r(460),a=function(e){function t(t,r){var i=e.call(this)||this;return i._optionsService=t,i._bufferService=r,i._onBufferActivate=i.register(new o.EventEmitter),i.reset(),i}return n(t,e),Object.defineProperty(t.prototype,"onBufferActivate",{get:function(){return this._onBufferActivate.event},enumerable:!1,configurable:!0}),t.prototype.reset=function(){this._normal=new s.Buffer(!0,this._optionsService,this._bufferService),this._normal.fillViewportRows(),this._alt=new s.Buffer(!1,this._optionsService,this._bufferService),this._activeBuffer=this._normal,this._onBufferActivate.fire({activeBuffer:this._normal,inactiveBuffer:this._alt}),this.setupTabStops();},Object.defineProperty(t.prototype,"alt",{get:function(){return this._alt},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"active",{get:function(){return this._activeBuffer},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"normal",{get:function(){return this._normal},enumerable:!1,configurable:!0}),t.prototype.activateNormalBuffer=function(){this._activeBuffer!==this._normal&&(this._normal.x=this._alt.x,this._normal.y=this._alt.y,this._alt.clear(),this._activeBuffer=this._normal,this._onBufferActivate.fire({activeBuffer:this._normal,inactiveBuffer:this._alt}));},t.prototype.activateAltBuffer=function(e){this._activeBuffer!==this._alt&&(this._alt.fillViewportRows(e),this._alt.x=this._normal.x,this._alt.y=this._normal.y,this._activeBuffer=this._alt,this._onBufferActivate.fire({activeBuffer:this._alt,inactiveBuffer:this._normal}));},t.prototype.resize=function(e,t){this._normal.resize(e,t),this._alt.resize(e,t);},t.prototype.setupTabStops=function(e){this._normal.setupTabStops(e),this._alt.setupTabStops(e);},t}(r(844).Disposable);t.BufferSet=a;},511:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);});Object.defineProperty(t,"__esModule",{value:!0}),t.CellData=void 0;var s=r(482),o=r(643),a=r(734),c=function(e){function t(){var t=null!==e&&e.apply(this,arguments)||this;return t.content=0,t.fg=0,t.bg=0,t.extended=new a.ExtendedAttrs,t.combinedData="",t}return n(t,e),t.fromCharData=function(e){var r=new t;return r.setFromCharData(e),r},t.prototype.isCombined=function(){return 2097152&this.content},t.prototype.getWidth=function(){return this.content>>22},t.prototype.getChars=function(){return 2097152&this.content?this.combinedData:2097151&this.content?(0, s.stringFromCodePoint)(2097151&this.content):""},t.prototype.getCode=function(){return this.isCombined()?this.combinedData.charCodeAt(this.combinedData.length-1):2097151&this.content},t.prototype.setFromCharData=function(e){this.fg=e[o.CHAR_DATA_ATTR_INDEX],this.bg=0;var t=!1;if(e[o.CHAR_DATA_CHAR_INDEX].length>2)t=!0;else if(2===e[o.CHAR_DATA_CHAR_INDEX].length){var r=e[o.CHAR_DATA_CHAR_INDEX].charCodeAt(0);if(55296<=r&&r<=56319){var i=e[o.CHAR_DATA_CHAR_INDEX].charCodeAt(1);56320<=i&&i<=57343?this.content=1024*(r-55296)+i-56320+65536|e[o.CHAR_DATA_WIDTH_INDEX]<<22:t=!0;}else t=!0;}else this.content=e[o.CHAR_DATA_CHAR_INDEX].charCodeAt(0)|e[o.CHAR_DATA_WIDTH_INDEX]<<22;t&&(this.combinedData=e[o.CHAR_DATA_CHAR_INDEX],this.content=2097152|e[o.CHAR_DATA_WIDTH_INDEX]<<22);},t.prototype.getAsCharData=function(){return [this.fg,this.getChars(),this.getWidth(),this.getCode()]},t}(a.AttributeData);t.CellData=c;},643:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.WHITESPACE_CELL_CODE=t.WHITESPACE_CELL_WIDTH=t.WHITESPACE_CELL_CHAR=t.NULL_CELL_CODE=t.NULL_CELL_WIDTH=t.NULL_CELL_CHAR=t.CHAR_DATA_CODE_INDEX=t.CHAR_DATA_WIDTH_INDEX=t.CHAR_DATA_CHAR_INDEX=t.CHAR_DATA_ATTR_INDEX=t.DEFAULT_ATTR=t.DEFAULT_COLOR=void 0,t.DEFAULT_COLOR=256,t.DEFAULT_ATTR=256|t.DEFAULT_COLOR<<9,t.CHAR_DATA_ATTR_INDEX=0,t.CHAR_DATA_CHAR_INDEX=1,t.CHAR_DATA_WIDTH_INDEX=2,t.CHAR_DATA_CODE_INDEX=3,t.NULL_CELL_CHAR="",t.NULL_CELL_WIDTH=1,t.NULL_CELL_CODE=0,t.WHITESPACE_CELL_CHAR=" ",t.WHITESPACE_CELL_WIDTH=1,t.WHITESPACE_CELL_CODE=32;},863:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);});Object.defineProperty(t,"__esModule",{value:!0}),t.Marker=void 0;var s=r(460),o=function(e){function t(r){var i=e.call(this)||this;return i.line=r,i._id=t._nextId++,i.isDisposed=!1,i._onDispose=new s.EventEmitter,i}return n(t,e),Object.defineProperty(t.prototype,"id",{get:function(){return this._id},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onDispose",{get:function(){return this._onDispose.event},enumerable:!1,configurable:!0}),t.prototype.dispose=function(){this.isDisposed||(this.isDisposed=!0,this.line=-1,this._onDispose.fire(),e.prototype.dispose.call(this));},t._nextId=1,t}(r(844).Disposable);t.Marker=o;},116:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.DEFAULT_CHARSET=t.CHARSETS=void 0,t.CHARSETS={},t.DEFAULT_CHARSET=t.CHARSETS.B,t.CHARSETS[0]={"`":"◆",a:"▒",b:"␉",c:"␌",d:"␍",e:"␊",f:"°",g:"±",h:"␤",i:"␋",j:"┘",k:"┐",l:"┌",m:"└",n:"┼",o:"⎺",p:"⎻",q:"─",r:"⎼",s:"⎽",t:"├",u:"┤",v:"┴",w:"┬",x:"│",y:"≤",z:"≥","{":"π","|":"≠","}":"£","~":"·"},t.CHARSETS.A={"#":"£"},t.CHARSETS.B=void 0,t.CHARSETS[4]={"#":"£","@":"¾","[":"ij","\\":"½","]":"|","{":"¨","|":"f","}":"¼","~":"´"},t.CHARSETS.C=t.CHARSETS[5]={"[":"Ä","\\":"Ö","]":"Å","^":"Ü","`":"é","{":"ä","|":"ö","}":"å","~":"ü"},t.CHARSETS.R={"#":"£","@":"à","[":"°","\\":"ç","]":"§","{":"é","|":"ù","}":"è","~":"¨"},t.CHARSETS.Q={"@":"à","[":"â","\\":"ç","]":"ê","^":"î","`":"ô","{":"é","|":"ù","}":"è","~":"û"},t.CHARSETS.K={"@":"§","[":"Ä","\\":"Ö","]":"Ü","{":"ä","|":"ö","}":"ü","~":"ß"},t.CHARSETS.Y={"#":"£","@":"§","[":"°","\\":"ç","]":"é","`":"ù","{":"à","|":"ò","}":"è","~":"ì"},t.CHARSETS.E=t.CHARSETS[6]={"@":"Ä","[":"Æ","\\":"Ø","]":"Å","^":"Ü","`":"ä","{":"æ","|":"ø","}":"å","~":"ü"},t.CHARSETS.Z={"#":"£","@":"§","[":"¡","\\":"Ñ","]":"¿","{":"°","|":"ñ","}":"ç"},t.CHARSETS.H=t.CHARSETS[7]={"@":"É","[":"Ä","\\":"Ö","]":"Å","^":"Ü","`":"é","{":"ä","|":"ö","}":"å","~":"ü"},t.CHARSETS["="]={"#":"ù","@":"à","[":"é","\\":"ç","]":"ê","^":"î",_:"è","`":"ô","{":"ä","|":"ö","}":"ü","~":"û"};},584:(e,t)=>{var r,i;Object.defineProperty(t,"__esModule",{value:!0}),t.C1_ESCAPED=t.C1=t.C0=void 0,function(e){e.NUL="\0",e.SOH="",e.STX="",e.ETX="",e.EOT="",e.ENQ="",e.ACK="",e.BEL="",e.BS="\b",e.HT="\t",e.LF="\n",e.VT="\v",e.FF="\f",e.CR="\r",e.SO="",e.SI="",e.DLE="",e.DC1="",e.DC2="",e.DC3="",e.DC4="",e.NAK="",e.SYN="",e.ETB="",e.CAN="",e.EM="",e.SUB="",e.ESC="",e.FS="",e.GS="",e.RS="",e.US="",e.SP=" ",e.DEL="";}(r=t.C0||(t.C0={})),(i=t.C1||(t.C1={})).PAD="",i.HOP="",i.BPH="",i.NBH="",i.IND="",i.NEL="",i.SSA="",i.ESA="",i.HTS="",i.HTJ="",i.VTS="",i.PLD="",i.PLU="",i.RI="",i.SS2="",i.SS3="",i.DCS="",i.PU1="",i.PU2="",i.STS="",i.CCH="",i.MW="",i.SPA="",i.EPA="",i.SOS="",i.SGCI="",i.SCI="",i.CSI="",i.ST="",i.OSC="",i.PM="",i.APC="",(t.C1_ESCAPED||(t.C1_ESCAPED={})).ST=r.ESC+"\\";},482:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.Utf8ToUtf32=t.StringToUtf32=t.utf32ToString=t.stringFromCodePoint=void 0,t.stringFromCodePoint=function(e){return e>65535?(e-=65536,String.fromCharCode(55296+(e>>10))+String.fromCharCode(e%1024+56320)):String.fromCharCode(e)},t.utf32ToString=function(e,t,r){void 0===t&&(t=0),void 0===r&&(r=e.length);for(var i="",n=t;n<r;++n){var s=e[n];s>65535?(s-=65536,i+=String.fromCharCode(55296+(s>>10))+String.fromCharCode(s%1024+56320)):i+=String.fromCharCode(s);}return i};var r=function(){function e(){this._interim=0;}return e.prototype.clear=function(){this._interim=0;},e.prototype.decode=function(e,t){var r=e.length;if(!r)return 0;var i=0,n=0;this._interim&&(56320<=(a=e.charCodeAt(n++))&&a<=57343?t[i++]=1024*(this._interim-55296)+a-56320+65536:(t[i++]=this._interim,t[i++]=a),this._interim=0);for(var s=n;s<r;++s){var o=e.charCodeAt(s);if(55296<=o&&o<=56319){if(++s>=r)return this._interim=o,i;var a;56320<=(a=e.charCodeAt(s))&&a<=57343?t[i++]=1024*(o-55296)+a-56320+65536:(t[i++]=o,t[i++]=a);}else 65279!==o&&(t[i++]=o);}return i},e}();t.StringToUtf32=r;var i=function(){function e(){this.interim=new Uint8Array(3);}return e.prototype.clear=function(){this.interim.fill(0);},e.prototype.decode=function(e,t){var r=e.length;if(!r)return 0;var i,n,s,o,a=0,c=0,f=0;if(this.interim[0]){var u=!1,h=this.interim[0];h&=192==(224&h)?31:224==(240&h)?15:7;for(var l=0,p=void 0;(p=63&this.interim[++l])&&l<4;)h<<=6,h|=p;for(var _=192==(224&this.interim[0])?2:224==(240&this.interim[0])?3:4,d=_-l;f<d;){if(f>=r)return 0;if(128!=(192&(p=e[f++]))){f--,u=!0;break}this.interim[l++]=p,h<<=6,h|=63&p;}u||(2===_?h<128?f--:t[a++]=h:3===_?h<2048||h>=55296&&h<=57343||65279===h||(t[a++]=h):h<65536||h>1114111||(t[a++]=h)),this.interim.fill(0);}for(var v=r-4,g=f;g<r;){for(;!(!(g<v)||128&(i=e[g])||128&(n=e[g+1])||128&(s=e[g+2])||128&(o=e[g+3]));)t[a++]=i,t[a++]=n,t[a++]=s,t[a++]=o,g+=4;if((i=e[g++])<128)t[a++]=i;else if(192==(224&i)){if(g>=r)return this.interim[0]=i,a;if(128!=(192&(n=e[g++]))){g--;continue}if((c=(31&i)<<6|63&n)<128){g--;continue}t[a++]=c;}else if(224==(240&i)){if(g>=r)return this.interim[0]=i,a;if(128!=(192&(n=e[g++]))){g--;continue}if(g>=r)return this.interim[0]=i,this.interim[1]=n,a;if(128!=(192&(s=e[g++]))){g--;continue}if((c=(15&i)<<12|(63&n)<<6|63&s)<2048||c>=55296&&c<=57343||65279===c)continue;t[a++]=c;}else if(240==(248&i)){if(g>=r)return this.interim[0]=i,a;if(128!=(192&(n=e[g++]))){g--;continue}if(g>=r)return this.interim[0]=i,this.interim[1]=n,a;if(128!=(192&(s=e[g++]))){g--;continue}if(g>=r)return this.interim[0]=i,this.interim[1]=n,this.interim[2]=s,a;if(128!=(192&(o=e[g++]))){g--;continue}if((c=(7&i)<<18|(63&n)<<12|(63&s)<<6|63&o)<65536||c>1114111)continue;t[a++]=c;}}return a},e}();t.Utf8ToUtf32=i;},225:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.UnicodeV6=void 0;var i,n=r(273),s=[[768,879],[1155,1158],[1160,1161],[1425,1469],[1471,1471],[1473,1474],[1476,1477],[1479,1479],[1536,1539],[1552,1557],[1611,1630],[1648,1648],[1750,1764],[1767,1768],[1770,1773],[1807,1807],[1809,1809],[1840,1866],[1958,1968],[2027,2035],[2305,2306],[2364,2364],[2369,2376],[2381,2381],[2385,2388],[2402,2403],[2433,2433],[2492,2492],[2497,2500],[2509,2509],[2530,2531],[2561,2562],[2620,2620],[2625,2626],[2631,2632],[2635,2637],[2672,2673],[2689,2690],[2748,2748],[2753,2757],[2759,2760],[2765,2765],[2786,2787],[2817,2817],[2876,2876],[2879,2879],[2881,2883],[2893,2893],[2902,2902],[2946,2946],[3008,3008],[3021,3021],[3134,3136],[3142,3144],[3146,3149],[3157,3158],[3260,3260],[3263,3263],[3270,3270],[3276,3277],[3298,3299],[3393,3395],[3405,3405],[3530,3530],[3538,3540],[3542,3542],[3633,3633],[3636,3642],[3655,3662],[3761,3761],[3764,3769],[3771,3772],[3784,3789],[3864,3865],[3893,3893],[3895,3895],[3897,3897],[3953,3966],[3968,3972],[3974,3975],[3984,3991],[3993,4028],[4038,4038],[4141,4144],[4146,4146],[4150,4151],[4153,4153],[4184,4185],[4448,4607],[4959,4959],[5906,5908],[5938,5940],[5970,5971],[6002,6003],[6068,6069],[6071,6077],[6086,6086],[6089,6099],[6109,6109],[6155,6157],[6313,6313],[6432,6434],[6439,6440],[6450,6450],[6457,6459],[6679,6680],[6912,6915],[6964,6964],[6966,6970],[6972,6972],[6978,6978],[7019,7027],[7616,7626],[7678,7679],[8203,8207],[8234,8238],[8288,8291],[8298,8303],[8400,8431],[12330,12335],[12441,12442],[43014,43014],[43019,43019],[43045,43046],[64286,64286],[65024,65039],[65056,65059],[65279,65279],[65529,65531]],o=[[68097,68099],[68101,68102],[68108,68111],[68152,68154],[68159,68159],[119143,119145],[119155,119170],[119173,119179],[119210,119213],[119362,119364],[917505,917505],[917536,917631],[917760,917999]],a=function(){function e(){if(this.version="6",!i){i=new Uint8Array(65536),(0, n.fill)(i,1),i[0]=0,(0, n.fill)(i,0,1,32),(0, n.fill)(i,0,127,160),(0, n.fill)(i,2,4352,4448),i[9001]=2,i[9002]=2,(0, n.fill)(i,2,11904,42192),i[12351]=1,(0, n.fill)(i,2,44032,55204),(0, n.fill)(i,2,63744,64256),(0, n.fill)(i,2,65040,65050),(0, n.fill)(i,2,65072,65136),(0, n.fill)(i,2,65280,65377),(0, n.fill)(i,2,65504,65511);for(var e=0;e<s.length;++e)(0, n.fill)(i,0,s[e][0],s[e][1]+1);}}return e.prototype.wcwidth=function(e){return e<32?0:e<127?1:e<65536?i[e]:function(e,t){var r,i=0,n=t.length-1;if(e<t[0][0]||e>t[n][1])return !1;for(;n>=i;)if(e>t[r=i+n>>1][1])i=r+1;else {if(!(e<t[r][0]))return !0;n=r-1;}return !1}(e,o)?0:e>=131072&&e<=196605||e>=196608&&e<=262141?2:1},e}();t.UnicodeV6=a;},981:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.WriteBuffer=void 0;var i=r(460),n="undefined"==typeof queueMicrotask?function(e){Promise.resolve().then(e);}:queueMicrotask,s=function(){function e(e){this._action=e,this._writeBuffer=[],this._callbacks=[],this._pendingData=0,this._bufferOffset=0,this._isSyncWriting=!1,this._syncCalls=0,this._onWriteParsed=new i.EventEmitter;}return Object.defineProperty(e.prototype,"onWriteParsed",{get:function(){return this._onWriteParsed.event},enumerable:!1,configurable:!0}),e.prototype.writeSync=function(e,t){if(void 0!==t&&this._syncCalls>t)this._syncCalls=0;else if(this._pendingData+=e.length,this._writeBuffer.push(e),this._callbacks.push(void 0),this._syncCalls++,!this._isSyncWriting){var r;for(this._isSyncWriting=!0;r=this._writeBuffer.shift();){this._action(r);var i=this._callbacks.shift();i&&i();}this._pendingData=0,this._bufferOffset=2147483647,this._isSyncWriting=!1,this._syncCalls=0;}},e.prototype.write=function(e,t){var r=this;if(this._pendingData>5e7)throw new Error("write data discarded, use flow control to avoid losing data");this._writeBuffer.length||(this._bufferOffset=0,setTimeout((function(){return r._innerWrite()}))),this._pendingData+=e.length,this._writeBuffer.push(e),this._callbacks.push(t);},e.prototype._innerWrite=function(e,t){var r=this;void 0===e&&(e=0),void 0===t&&(t=!0);for(var i=e||Date.now();this._writeBuffer.length>this._bufferOffset;){var s=this._writeBuffer[this._bufferOffset],o=this._action(s,t);if(o)return void o.catch((function(e){return n((function(){throw e})),Promise.resolve(!1)})).then((function(e){return Date.now()-i>=12?setTimeout((function(){return r._innerWrite(0,e)})):r._innerWrite(i,e)}));var a=this._callbacks[this._bufferOffset];if(a&&a(),this._bufferOffset++,this._pendingData-=s.length,Date.now()-i>=12)break}this._writeBuffer.length>this._bufferOffset?(this._bufferOffset>50&&(this._writeBuffer=this._writeBuffer.slice(this._bufferOffset),this._callbacks=this._callbacks.slice(this._bufferOffset),this._bufferOffset=0),setTimeout((function(){return r._innerWrite()}))):(this._writeBuffer.length=0,this._callbacks.length=0,this._pendingData=0,this._bufferOffset=0),this._onWriteParsed.fire();},e}();t.WriteBuffer=s;},941:function(e,t){var r=this&&this.__read||function(e,t){var r="function"==typeof Symbol&&e[Symbol.iterator];if(!r)return e;var i,n,s=r.call(e),o=[];try{for(;(void 0===t||t-- >0)&&!(i=s.next()).done;)o.push(i.value);}catch(e){n={error:e};}finally{try{i&&!i.done&&(r=s.return)&&r.call(s);}finally{if(n)throw n.error}}return o};Object.defineProperty(t,"__esModule",{value:!0}),t.toRgbString=t.parseColor=void 0;var i=/^([\da-f])\/([\da-f])\/([\da-f])$|^([\da-f]{2})\/([\da-f]{2})\/([\da-f]{2})$|^([\da-f]{3})\/([\da-f]{3})\/([\da-f]{3})$|^([\da-f]{4})\/([\da-f]{4})\/([\da-f]{4})$/,n=/^[\da-f]+$/;function s(e,t){var r=e.toString(16),i=r.length<2?"0"+r:r;switch(t){case 4:return r[0];case 8:return i;case 12:return (i+i).slice(0,3);default:return i+i}}t.parseColor=function(e){if(e){var t=e.toLowerCase();if(0===t.indexOf("rgb:")){t=t.slice(4);var r=i.exec(t);if(r){var s=r[1]?15:r[4]?255:r[7]?4095:65535;return [Math.round(parseInt(r[1]||r[4]||r[7]||r[10],16)/s*255),Math.round(parseInt(r[2]||r[5]||r[8]||r[11],16)/s*255),Math.round(parseInt(r[3]||r[6]||r[9]||r[12],16)/s*255)]}}else if(0===t.indexOf("#")&&(t=t.slice(1),n.exec(t)&&[3,6,9,12].includes(t.length))){for(var o=t.length/3,a=[0,0,0],c=0;c<3;++c){var f=parseInt(t.slice(o*c,o*c+o),16);a[c]=1===o?f<<4:2===o?f:3===o?f>>4:f>>8;}return a}}},t.toRgbString=function(e,t){void 0===t&&(t=16);var i=r(e,3),n=i[0],o=i[1],a=i[2];return "rgb:"+s(n,t)+"/"+s(o,t)+"/"+s(a,t)};},770:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.PAYLOAD_LIMIT=void 0,t.PAYLOAD_LIMIT=1e7;},351:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.DcsHandler=t.DcsParser=void 0;var i=r(482),n=r(742),s=r(770),o=[],a=function(){function e(){this._handlers=Object.create(null),this._active=o,this._ident=0,this._handlerFb=function(){},this._stack={paused:!1,loopPosition:0,fallThrough:!1};}return e.prototype.dispose=function(){this._handlers=Object.create(null),this._handlerFb=function(){},this._active=o;},e.prototype.registerHandler=function(e,t){void 0===this._handlers[e]&&(this._handlers[e]=[]);var r=this._handlers[e];return r.push(t),{dispose:function(){var e=r.indexOf(t);-1!==e&&r.splice(e,1);}}},e.prototype.clearHandler=function(e){this._handlers[e]&&delete this._handlers[e];},e.prototype.setHandlerFallback=function(e){this._handlerFb=e;},e.prototype.reset=function(){if(this._active.length)for(var e=this._stack.paused?this._stack.loopPosition-1:this._active.length-1;e>=0;--e)this._active[e].unhook(!1);this._stack.paused=!1,this._active=o,this._ident=0;},e.prototype.hook=function(e,t){if(this.reset(),this._ident=e,this._active=this._handlers[e]||o,this._active.length)for(var r=this._active.length-1;r>=0;r--)this._active[r].hook(t);else this._handlerFb(this._ident,"HOOK",t);},e.prototype.put=function(e,t,r){if(this._active.length)for(var n=this._active.length-1;n>=0;n--)this._active[n].put(e,t,r);else this._handlerFb(this._ident,"PUT",(0, i.utf32ToString)(e,t,r));},e.prototype.unhook=function(e,t){if(void 0===t&&(t=!0),this._active.length){var r=!1,i=this._active.length-1,n=!1;if(this._stack.paused&&(i=this._stack.loopPosition-1,r=t,n=this._stack.fallThrough,this._stack.paused=!1),!n&&!1===r){for(;i>=0&&!0!==(r=this._active[i].unhook(e));i--)if(r instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=i,this._stack.fallThrough=!1,r;i--;}for(;i>=0;i--)if((r=this._active[i].unhook(!1))instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=i,this._stack.fallThrough=!0,r}else this._handlerFb(this._ident,"UNHOOK",e);this._active=o,this._ident=0;},e}();t.DcsParser=a;var c=new n.Params;c.addParam(0);var f=function(){function e(e){this._handler=e,this._data="",this._params=c,this._hitLimit=!1;}return e.prototype.hook=function(e){this._params=e.length>1||e.params[0]?e.clone():c,this._data="",this._hitLimit=!1;},e.prototype.put=function(e,t,r){this._hitLimit||(this._data+=(0, i.utf32ToString)(e,t,r),this._data.length>s.PAYLOAD_LIMIT&&(this._data="",this._hitLimit=!0));},e.prototype.unhook=function(e){var t=this,r=!1;if(this._hitLimit)r=!1;else if(e&&(r=this._handler(this._data,this._params))instanceof Promise)return r.then((function(e){return t._params=c,t._data="",t._hitLimit=!1,e}));return this._params=c,this._data="",this._hitLimit=!1,r},e}();t.DcsHandler=f;},15:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);});Object.defineProperty(t,"__esModule",{value:!0}),t.EscapeSequenceParser=t.VT500_TRANSITION_TABLE=t.TransitionTable=void 0;var s=r(844),o=r(273),a=r(742),c=r(242),f=r(351),u=function(){function e(e){this.table=new Uint8Array(e);}return e.prototype.setDefault=function(e,t){(0, o.fill)(this.table,e<<4|t);},e.prototype.add=function(e,t,r,i){this.table[t<<8|e]=r<<4|i;},e.prototype.addMany=function(e,t,r,i){for(var n=0;n<e.length;n++)this.table[t<<8|e[n]]=r<<4|i;},e}();t.TransitionTable=u;var h=160;t.VT500_TRANSITION_TABLE=function(){var e=new u(4095),t=Array.apply(null,Array(256)).map((function(e,t){return t})),r=function(e,r){return t.slice(e,r)},i=r(32,127),n=r(0,24);n.push(25),n.push.apply(n,r(28,32));var s,o=r(0,14);for(s in e.setDefault(1,0),e.addMany(i,0,2,0),o)e.addMany([24,26,153,154],s,3,0),e.addMany(r(128,144),s,3,0),e.addMany(r(144,152),s,3,0),e.add(156,s,0,0),e.add(27,s,11,1),e.add(157,s,4,8),e.addMany([152,158,159],s,0,7),e.add(155,s,11,3),e.add(144,s,11,9);return e.addMany(n,0,3,0),e.addMany(n,1,3,1),e.add(127,1,0,1),e.addMany(n,8,0,8),e.addMany(n,3,3,3),e.add(127,3,0,3),e.addMany(n,4,3,4),e.add(127,4,0,4),e.addMany(n,6,3,6),e.addMany(n,5,3,5),e.add(127,5,0,5),e.addMany(n,2,3,2),e.add(127,2,0,2),e.add(93,1,4,8),e.addMany(i,8,5,8),e.add(127,8,5,8),e.addMany([156,27,24,26,7],8,6,0),e.addMany(r(28,32),8,0,8),e.addMany([88,94,95],1,0,7),e.addMany(i,7,0,7),e.addMany(n,7,0,7),e.add(156,7,0,0),e.add(127,7,0,7),e.add(91,1,11,3),e.addMany(r(64,127),3,7,0),e.addMany(r(48,60),3,8,4),e.addMany([60,61,62,63],3,9,4),e.addMany(r(48,60),4,8,4),e.addMany(r(64,127),4,7,0),e.addMany([60,61,62,63],4,0,6),e.addMany(r(32,64),6,0,6),e.add(127,6,0,6),e.addMany(r(64,127),6,0,0),e.addMany(r(32,48),3,9,5),e.addMany(r(32,48),5,9,5),e.addMany(r(48,64),5,0,6),e.addMany(r(64,127),5,7,0),e.addMany(r(32,48),4,9,5),e.addMany(r(32,48),1,9,2),e.addMany(r(32,48),2,9,2),e.addMany(r(48,127),2,10,0),e.addMany(r(48,80),1,10,0),e.addMany(r(81,88),1,10,0),e.addMany([89,90,92],1,10,0),e.addMany(r(96,127),1,10,0),e.add(80,1,11,9),e.addMany(n,9,0,9),e.add(127,9,0,9),e.addMany(r(28,32),9,0,9),e.addMany(r(32,48),9,9,12),e.addMany(r(48,60),9,8,10),e.addMany([60,61,62,63],9,9,10),e.addMany(n,11,0,11),e.addMany(r(32,128),11,0,11),e.addMany(r(28,32),11,0,11),e.addMany(n,10,0,10),e.add(127,10,0,10),e.addMany(r(28,32),10,0,10),e.addMany(r(48,60),10,8,10),e.addMany([60,61,62,63],10,0,11),e.addMany(r(32,48),10,9,12),e.addMany(n,12,0,12),e.add(127,12,0,12),e.addMany(r(28,32),12,0,12),e.addMany(r(32,48),12,9,12),e.addMany(r(48,64),12,0,11),e.addMany(r(64,127),12,12,13),e.addMany(r(64,127),10,12,13),e.addMany(r(64,127),9,12,13),e.addMany(n,13,13,13),e.addMany(i,13,13,13),e.add(127,13,0,13),e.addMany([27,156,24,26],13,14,0),e.add(h,0,2,0),e.add(h,8,5,8),e.add(h,6,0,6),e.add(h,11,0,11),e.add(h,13,13,13),e}();var l=function(e){function r(r){void 0===r&&(r=t.VT500_TRANSITION_TABLE);var i=e.call(this)||this;return i._transitions=r,i._parseStack={state:0,handlers:[],handlerPos:0,transition:0,chunkPos:0},i.initialState=0,i.currentState=i.initialState,i._params=new a.Params,i._params.addParam(0),i._collect=0,i.precedingCodepoint=0,i._printHandlerFb=function(e,t,r){},i._executeHandlerFb=function(e){},i._csiHandlerFb=function(e,t){},i._escHandlerFb=function(e){},i._errorHandlerFb=function(e){return e},i._printHandler=i._printHandlerFb,i._executeHandlers=Object.create(null),i._csiHandlers=Object.create(null),i._escHandlers=Object.create(null),i._oscParser=new c.OscParser,i._dcsParser=new f.DcsParser,i._errorHandler=i._errorHandlerFb,i.registerEscHandler({final:"\\"},(function(){return !0})),i}return n(r,e),r.prototype._identifier=function(e,t){void 0===t&&(t=[64,126]);var r=0;if(e.prefix){if(e.prefix.length>1)throw new Error("only one byte as prefix supported");if((r=e.prefix.charCodeAt(0))&&60>r||r>63)throw new Error("prefix must be in range 0x3c .. 0x3f")}if(e.intermediates){if(e.intermediates.length>2)throw new Error("only two bytes as intermediates are supported");for(var i=0;i<e.intermediates.length;++i){var n=e.intermediates.charCodeAt(i);if(32>n||n>47)throw new Error("intermediate must be in range 0x20 .. 0x2f");r<<=8,r|=n;}}if(1!==e.final.length)throw new Error("final must be a single byte");var s=e.final.charCodeAt(0);if(t[0]>s||s>t[1])throw new Error("final must be in range "+t[0]+" .. "+t[1]);return (r<<=8)|s},r.prototype.identToString=function(e){for(var t=[];e;)t.push(String.fromCharCode(255&e)),e>>=8;return t.reverse().join("")},r.prototype.dispose=function(){this._csiHandlers=Object.create(null),this._executeHandlers=Object.create(null),this._escHandlers=Object.create(null),this._oscParser.dispose(),this._dcsParser.dispose();},r.prototype.setPrintHandler=function(e){this._printHandler=e;},r.prototype.clearPrintHandler=function(){this._printHandler=this._printHandlerFb;},r.prototype.registerEscHandler=function(e,t){var r=this._identifier(e,[48,126]);void 0===this._escHandlers[r]&&(this._escHandlers[r]=[]);var i=this._escHandlers[r];return i.push(t),{dispose:function(){var e=i.indexOf(t);-1!==e&&i.splice(e,1);}}},r.prototype.clearEscHandler=function(e){this._escHandlers[this._identifier(e,[48,126])]&&delete this._escHandlers[this._identifier(e,[48,126])];},r.prototype.setEscHandlerFallback=function(e){this._escHandlerFb=e;},r.prototype.setExecuteHandler=function(e,t){this._executeHandlers[e.charCodeAt(0)]=t;},r.prototype.clearExecuteHandler=function(e){this._executeHandlers[e.charCodeAt(0)]&&delete this._executeHandlers[e.charCodeAt(0)];},r.prototype.setExecuteHandlerFallback=function(e){this._executeHandlerFb=e;},r.prototype.registerCsiHandler=function(e,t){var r=this._identifier(e);void 0===this._csiHandlers[r]&&(this._csiHandlers[r]=[]);var i=this._csiHandlers[r];return i.push(t),{dispose:function(){var e=i.indexOf(t);-1!==e&&i.splice(e,1);}}},r.prototype.clearCsiHandler=function(e){this._csiHandlers[this._identifier(e)]&&delete this._csiHandlers[this._identifier(e)];},r.prototype.setCsiHandlerFallback=function(e){this._csiHandlerFb=e;},r.prototype.registerDcsHandler=function(e,t){return this._dcsParser.registerHandler(this._identifier(e),t)},r.prototype.clearDcsHandler=function(e){this._dcsParser.clearHandler(this._identifier(e));},r.prototype.setDcsHandlerFallback=function(e){this._dcsParser.setHandlerFallback(e);},r.prototype.registerOscHandler=function(e,t){return this._oscParser.registerHandler(e,t)},r.prototype.clearOscHandler=function(e){this._oscParser.clearHandler(e);},r.prototype.setOscHandlerFallback=function(e){this._oscParser.setHandlerFallback(e);},r.prototype.setErrorHandler=function(e){this._errorHandler=e;},r.prototype.clearErrorHandler=function(){this._errorHandler=this._errorHandlerFb;},r.prototype.reset=function(){this.currentState=this.initialState,this._oscParser.reset(),this._dcsParser.reset(),this._params.reset(),this._params.addParam(0),this._collect=0,this.precedingCodepoint=0,0!==this._parseStack.state&&(this._parseStack.state=2,this._parseStack.handlers=[]);},r.prototype._preserveStack=function(e,t,r,i,n){this._parseStack.state=e,this._parseStack.handlers=t,this._parseStack.handlerPos=r,this._parseStack.transition=i,this._parseStack.chunkPos=n;},r.prototype.parse=function(e,t,r){var i,n=0,s=0,o=0;if(this._parseStack.state)if(2===this._parseStack.state)this._parseStack.state=0,o=this._parseStack.chunkPos+1;else {if(void 0===r||1===this._parseStack.state)throw this._parseStack.state=1,new Error("improper continuation due to previous async handler, giving up parsing");var a=this._parseStack.handlers,c=this._parseStack.handlerPos-1;switch(this._parseStack.state){case 3:if(!1===r&&c>-1)for(;c>=0&&!0!==(i=a[c](this._params));c--)if(i instanceof Promise)return this._parseStack.handlerPos=c,i;this._parseStack.handlers=[];break;case 4:if(!1===r&&c>-1)for(;c>=0&&!0!==(i=a[c]());c--)if(i instanceof Promise)return this._parseStack.handlerPos=c,i;this._parseStack.handlers=[];break;case 6:if(n=e[this._parseStack.chunkPos],i=this._dcsParser.unhook(24!==n&&26!==n,r))return i;27===n&&(this._parseStack.transition|=1),this._params.reset(),this._params.addParam(0),this._collect=0;break;case 5:if(n=e[this._parseStack.chunkPos],i=this._oscParser.end(24!==n&&26!==n,r))return i;27===n&&(this._parseStack.transition|=1),this._params.reset(),this._params.addParam(0),this._collect=0;}this._parseStack.state=0,o=this._parseStack.chunkPos+1,this.precedingCodepoint=0,this.currentState=15&this._parseStack.transition;}for(var f=o;f<t;++f){switch(n=e[f],(s=this._transitions.table[this.currentState<<8|(n<160?n:h)])>>4){case 2:for(var u=f+1;;++u){if(u>=t||(n=e[u])<32||n>126&&n<h){this._printHandler(e,f,u),f=u-1;break}if(++u>=t||(n=e[u])<32||n>126&&n<h){this._printHandler(e,f,u),f=u-1;break}if(++u>=t||(n=e[u])<32||n>126&&n<h){this._printHandler(e,f,u),f=u-1;break}if(++u>=t||(n=e[u])<32||n>126&&n<h){this._printHandler(e,f,u),f=u-1;break}}break;case 3:this._executeHandlers[n]?this._executeHandlers[n]():this._executeHandlerFb(n),this.precedingCodepoint=0;break;case 0:break;case 1:if(this._errorHandler({position:f,code:n,currentState:this.currentState,collect:this._collect,params:this._params,abort:!1}).abort)return;break;case 7:for(var l=(a=this._csiHandlers[this._collect<<8|n])?a.length-1:-1;l>=0&&!0!==(i=a[l](this._params));l--)if(i instanceof Promise)return this._preserveStack(3,a,l,s,f),i;l<0&&this._csiHandlerFb(this._collect<<8|n,this._params),this.precedingCodepoint=0;break;case 8:do{switch(n){case 59:this._params.addParam(0);break;case 58:this._params.addSubParam(-1);break;default:this._params.addDigit(n-48);}}while(++f<t&&(n=e[f])>47&&n<60);f--;break;case 9:this._collect<<=8,this._collect|=n;break;case 10:for(var p=this._escHandlers[this._collect<<8|n],_=p?p.length-1:-1;_>=0&&!0!==(i=p[_]());_--)if(i instanceof Promise)return this._preserveStack(4,p,_,s,f),i;_<0&&this._escHandlerFb(this._collect<<8|n),this.precedingCodepoint=0;break;case 11:this._params.reset(),this._params.addParam(0),this._collect=0;break;case 12:this._dcsParser.hook(this._collect<<8|n,this._params);break;case 13:for(var d=f+1;;++d)if(d>=t||24===(n=e[d])||26===n||27===n||n>127&&n<h){this._dcsParser.put(e,f,d),f=d-1;break}break;case 14:if(i=this._dcsParser.unhook(24!==n&&26!==n))return this._preserveStack(6,[],0,s,f),i;27===n&&(s|=1),this._params.reset(),this._params.addParam(0),this._collect=0,this.precedingCodepoint=0;break;case 4:this._oscParser.start();break;case 5:for(var v=f+1;;v++)if(v>=t||(n=e[v])<32||n>127&&n<h){this._oscParser.put(e,f,v),f=v-1;break}break;case 6:if(i=this._oscParser.end(24!==n&&26!==n))return this._preserveStack(5,[],0,s,f),i;27===n&&(s|=1),this._params.reset(),this._params.addParam(0),this._collect=0,this.precedingCodepoint=0;}this.currentState=15&s;}},r}(s.Disposable);t.EscapeSequenceParser=l;},242:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.OscHandler=t.OscParser=void 0;var i=r(770),n=r(482),s=[],o=function(){function e(){this._state=0,this._active=s,this._id=-1,this._handlers=Object.create(null),this._handlerFb=function(){},this._stack={paused:!1,loopPosition:0,fallThrough:!1};}return e.prototype.registerHandler=function(e,t){void 0===this._handlers[e]&&(this._handlers[e]=[]);var r=this._handlers[e];return r.push(t),{dispose:function(){var e=r.indexOf(t);-1!==e&&r.splice(e,1);}}},e.prototype.clearHandler=function(e){this._handlers[e]&&delete this._handlers[e];},e.prototype.setHandlerFallback=function(e){this._handlerFb=e;},e.prototype.dispose=function(){this._handlers=Object.create(null),this._handlerFb=function(){},this._active=s;},e.prototype.reset=function(){if(2===this._state)for(var e=this._stack.paused?this._stack.loopPosition-1:this._active.length-1;e>=0;--e)this._active[e].end(!1);this._stack.paused=!1,this._active=s,this._id=-1,this._state=0;},e.prototype._start=function(){if(this._active=this._handlers[this._id]||s,this._active.length)for(var e=this._active.length-1;e>=0;e--)this._active[e].start();else this._handlerFb(this._id,"START");},e.prototype._put=function(e,t,r){if(this._active.length)for(var i=this._active.length-1;i>=0;i--)this._active[i].put(e,t,r);else this._handlerFb(this._id,"PUT",(0, n.utf32ToString)(e,t,r));},e.prototype.start=function(){this.reset(),this._state=1;},e.prototype.put=function(e,t,r){if(3!==this._state){if(1===this._state)for(;t<r;){var i=e[t++];if(59===i){this._state=2,this._start();break}if(i<48||57<i)return void(this._state=3);-1===this._id&&(this._id=0),this._id=10*this._id+i-48;}2===this._state&&r-t>0&&this._put(e,t,r);}},e.prototype.end=function(e,t){if(void 0===t&&(t=!0),0!==this._state){if(3!==this._state)if(1===this._state&&this._start(),this._active.length){var r=!1,i=this._active.length-1,n=!1;if(this._stack.paused&&(i=this._stack.loopPosition-1,r=t,n=this._stack.fallThrough,this._stack.paused=!1),!n&&!1===r){for(;i>=0&&!0!==(r=this._active[i].end(e));i--)if(r instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=i,this._stack.fallThrough=!1,r;i--;}for(;i>=0;i--)if((r=this._active[i].end(!1))instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=i,this._stack.fallThrough=!0,r}else this._handlerFb(this._id,"END",e);this._active=s,this._id=-1,this._state=0;}},e}();t.OscParser=o;var a=function(){function e(e){this._handler=e,this._data="",this._hitLimit=!1;}return e.prototype.start=function(){this._data="",this._hitLimit=!1;},e.prototype.put=function(e,t,r){this._hitLimit||(this._data+=(0, n.utf32ToString)(e,t,r),this._data.length>i.PAYLOAD_LIMIT&&(this._data="",this._hitLimit=!0));},e.prototype.end=function(e){var t=this,r=!1;if(this._hitLimit)r=!1;else if(e&&(r=this._handler(this._data))instanceof Promise)return r.then((function(e){return t._data="",t._hitLimit=!1,e}));return this._data="",this._hitLimit=!1,r},e}();t.OscHandler=a;},742:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.Params=void 0;var r=2147483647,i=function(){function e(e,t){if(void 0===e&&(e=32),void 0===t&&(t=32),this.maxLength=e,this.maxSubParamsLength=t,t>256)throw new Error("maxSubParamsLength must not be greater than 256");this.params=new Int32Array(e),this.length=0,this._subParams=new Int32Array(t),this._subParamsLength=0,this._subParamsIdx=new Uint16Array(e),this._rejectDigits=!1,this._rejectSubDigits=!1,this._digitIsSub=!1;}return e.fromArray=function(t){var r=new e;if(!t.length)return r;for(var i=Array.isArray(t[0])?1:0;i<t.length;++i){var n=t[i];if(Array.isArray(n))for(var s=0;s<n.length;++s)r.addSubParam(n[s]);else r.addParam(n);}return r},e.prototype.clone=function(){var t=new e(this.maxLength,this.maxSubParamsLength);return t.params.set(this.params),t.length=this.length,t._subParams.set(this._subParams),t._subParamsLength=this._subParamsLength,t._subParamsIdx.set(this._subParamsIdx),t._rejectDigits=this._rejectDigits,t._rejectSubDigits=this._rejectSubDigits,t._digitIsSub=this._digitIsSub,t},e.prototype.toArray=function(){for(var e=[],t=0;t<this.length;++t){e.push(this.params[t]);var r=this._subParamsIdx[t]>>8,i=255&this._subParamsIdx[t];i-r>0&&e.push(Array.prototype.slice.call(this._subParams,r,i));}return e},e.prototype.reset=function(){this.length=0,this._subParamsLength=0,this._rejectDigits=!1,this._rejectSubDigits=!1,this._digitIsSub=!1;},e.prototype.addParam=function(e){if(this._digitIsSub=!1,this.length>=this.maxLength)this._rejectDigits=!0;else {if(e<-1)throw new Error("values lesser than -1 are not allowed");this._subParamsIdx[this.length]=this._subParamsLength<<8|this._subParamsLength,this.params[this.length++]=e>r?r:e;}},e.prototype.addSubParam=function(e){if(this._digitIsSub=!0,this.length)if(this._rejectDigits||this._subParamsLength>=this.maxSubParamsLength)this._rejectSubDigits=!0;else {if(e<-1)throw new Error("values lesser than -1 are not allowed");this._subParams[this._subParamsLength++]=e>r?r:e,this._subParamsIdx[this.length-1]++;}},e.prototype.hasSubParams=function(e){return (255&this._subParamsIdx[e])-(this._subParamsIdx[e]>>8)>0},e.prototype.getSubParams=function(e){var t=this._subParamsIdx[e]>>8,r=255&this._subParamsIdx[e];return r-t>0?this._subParams.subarray(t,r):null},e.prototype.getSubParamsAll=function(){for(var e={},t=0;t<this.length;++t){var r=this._subParamsIdx[t]>>8,i=255&this._subParamsIdx[t];i-r>0&&(e[t]=this._subParams.slice(r,i));}return e},e.prototype.addDigit=function(e){var t;if(!(this._rejectDigits||!(t=this._digitIsSub?this._subParamsLength:this.length)||this._digitIsSub&&this._rejectSubDigits)){var i=this._digitIsSub?this._subParams:this.params,n=i[t-1];i[t-1]=~n?Math.min(10*n+e,r):e;}},e}();t.Params=i;},741:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.AddonManager=void 0;var r=function(){function e(){this._addons=[];}return e.prototype.dispose=function(){for(var e=this._addons.length-1;e>=0;e--)this._addons[e].instance.dispose();},e.prototype.loadAddon=function(e,t){var r=this,i={instance:t,dispose:t.dispose,isDisposed:!1};this._addons.push(i),t.dispose=function(){return r._wrappedAddonDispose(i)},t.activate(e);},e.prototype._wrappedAddonDispose=function(e){if(!e.isDisposed){for(var t=-1,r=0;r<this._addons.length;r++)if(this._addons[r]===e){t=r;break}if(-1===t)throw new Error("Could not dispose an addon that has not been loaded");e.isDisposed=!0,e.dispose.apply(e.instance),this._addons.splice(t,1);}},e}();t.AddonManager=r;},771:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.BufferApiView=void 0;var i=r(785),n=r(511),s=function(){function e(e,t){this._buffer=e,this.type=t;}return e.prototype.init=function(e){return this._buffer=e,this},Object.defineProperty(e.prototype,"cursorY",{get:function(){return this._buffer.y},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"cursorX",{get:function(){return this._buffer.x},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"viewportY",{get:function(){return this._buffer.ydisp},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"baseY",{get:function(){return this._buffer.ybase},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"length",{get:function(){return this._buffer.lines.length},enumerable:!1,configurable:!0}),e.prototype.getLine=function(e){var t=this._buffer.lines.get(e);if(t)return new i.BufferLineApiView(t)},e.prototype.getNullCell=function(){return new n.CellData},e}();t.BufferApiView=s;},785:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.BufferLineApiView=void 0;var i=r(511),n=function(){function e(e){this._line=e;}return Object.defineProperty(e.prototype,"isWrapped",{get:function(){return this._line.isWrapped},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"length",{get:function(){return this._line.length},enumerable:!1,configurable:!0}),e.prototype.getCell=function(e,t){if(!(e<0||e>=this._line.length))return t?(this._line.loadCell(e,t),t):this._line.loadCell(e,new i.CellData)},e.prototype.translateToString=function(e,t,r){return this._line.translateToString(e,t,r)},e}();t.BufferLineApiView=n;},285:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.BufferNamespaceApi=void 0;var i=r(771),n=r(460),s=function(){function e(e){var t=this;this._core=e,this._onBufferChange=new n.EventEmitter,this._normal=new i.BufferApiView(this._core.buffers.normal,"normal"),this._alternate=new i.BufferApiView(this._core.buffers.alt,"alternate"),this._core.buffers.onBufferActivate((function(){return t._onBufferChange.fire(t.active)}));}return Object.defineProperty(e.prototype,"onBufferChange",{get:function(){return this._onBufferChange.event},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"active",{get:function(){if(this._core.buffers.active===this._core.buffers.normal)return this.normal;if(this._core.buffers.active===this._core.buffers.alt)return this.alternate;throw new Error("Active buffer is neither normal nor alternate")},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"normal",{get:function(){return this._normal.init(this._core.buffers.normal)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"alternate",{get:function(){return this._alternate.init(this._core.buffers.alt)},enumerable:!1,configurable:!0}),e}();t.BufferNamespaceApi=s;},975:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.ParserApi=void 0;var r=function(){function e(e){this._core=e;}return e.prototype.registerCsiHandler=function(e,t){return this._core.registerCsiHandler(e,(function(e){return t(e.toArray())}))},e.prototype.addCsiHandler=function(e,t){return this.registerCsiHandler(e,t)},e.prototype.registerDcsHandler=function(e,t){return this._core.registerDcsHandler(e,(function(e,r){return t(e,r.toArray())}))},e.prototype.addDcsHandler=function(e,t){return this.registerDcsHandler(e,t)},e.prototype.registerEscHandler=function(e,t){return this._core.registerEscHandler(e,t)},e.prototype.addEscHandler=function(e,t){return this.registerEscHandler(e,t)},e.prototype.registerOscHandler=function(e,t){return this._core.registerOscHandler(e,t)},e.prototype.addOscHandler=function(e,t){return this.registerOscHandler(e,t)},e}();t.ParserApi=r;},90:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.UnicodeApi=void 0;var r=function(){function e(e){this._core=e;}return e.prototype.register=function(e){this._core.unicodeService.register(e);},Object.defineProperty(e.prototype,"versions",{get:function(){return this._core.unicodeService.versions},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"activeVersion",{get:function(){return this._core.unicodeService.activeVersion},set:function(e){this._core.unicodeService.activeVersion=e;},enumerable:!1,configurable:!0}),e}();t.UnicodeApi=r;},744:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);}),s=this&&this.__decorate||function(e,t,r,i){var n,s=arguments.length,o=s<3?t:null===i?i=Object.getOwnPropertyDescriptor(t,r):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)o=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(n=e[a])&&(o=(s<3?n(o):s>3?n(t,r,o):n(t,r))||o);return s>3&&o&&Object.defineProperty(t,r,o),o},o=this&&this.__param||function(e,t){return function(r,i){t(r,i,e);}};Object.defineProperty(t,"__esModule",{value:!0}),t.BufferService=t.MINIMUM_ROWS=t.MINIMUM_COLS=void 0;var a=r(585),c=r(295),f=r(460),u=r(844);t.MINIMUM_COLS=2,t.MINIMUM_ROWS=1;var h=function(e){function r(r){var i=e.call(this)||this;return i._optionsService=r,i.isUserScrolling=!1,i._onResize=new f.EventEmitter,i._onScroll=new f.EventEmitter,i.cols=Math.max(r.rawOptions.cols||0,t.MINIMUM_COLS),i.rows=Math.max(r.rawOptions.rows||0,t.MINIMUM_ROWS),i.buffers=new c.BufferSet(r,i),i}return n(r,e),Object.defineProperty(r.prototype,"onResize",{get:function(){return this._onResize.event},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"onScroll",{get:function(){return this._onScroll.event},enumerable:!1,configurable:!0}),Object.defineProperty(r.prototype,"buffer",{get:function(){return this.buffers.active},enumerable:!1,configurable:!0}),r.prototype.dispose=function(){e.prototype.dispose.call(this),this.buffers.dispose();},r.prototype.resize=function(e,t){this.cols=e,this.rows=t,this.buffers.resize(e,t),this.buffers.setupTabStops(this.cols),this._onResize.fire({cols:e,rows:t});},r.prototype.reset=function(){this.buffers.reset(),this.isUserScrolling=!1;},r.prototype.scroll=function(e,t){void 0===t&&(t=!1);var r,i=this.buffer;(r=this._cachedBlankLine)&&r.length===this.cols&&r.getFg(0)===e.fg&&r.getBg(0)===e.bg||(r=i.getBlankLine(e,t),this._cachedBlankLine=r),r.isWrapped=t;var n=i.ybase+i.scrollTop,s=i.ybase+i.scrollBottom;if(0===i.scrollTop){var o=i.lines.isFull;s===i.lines.length-1?o?i.lines.recycle().copyFrom(r):i.lines.push(r.clone()):i.lines.splice(s+1,0,r.clone()),o?this.isUserScrolling&&(i.ydisp=Math.max(i.ydisp-1,0)):(i.ybase++,this.isUserScrolling||i.ydisp++);}else {var a=s-n+1;i.lines.shiftElements(n+1,a-1,-1),i.lines.set(s,r.clone());}this.isUserScrolling||(i.ydisp=i.ybase),this._onScroll.fire(i.ydisp);},r.prototype.scrollLines=function(e,t,r){var i=this.buffer;if(e<0){if(0===i.ydisp)return;this.isUserScrolling=!0;}else e+i.ydisp>=i.ybase&&(this.isUserScrolling=!1);var n=i.ydisp;i.ydisp=Math.max(Math.min(i.ydisp+e,i.ybase),0),n!==i.ydisp&&(t||this._onScroll.fire(i.ydisp));},r.prototype.scrollPages=function(e){this.scrollLines(e*(this.rows-1));},r.prototype.scrollToTop=function(){this.scrollLines(-this.buffer.ydisp);},r.prototype.scrollToBottom=function(){this.scrollLines(this.buffer.ybase-this.buffer.ydisp);},r.prototype.scrollToLine=function(e){var t=e-this.buffer.ydisp;0!==t&&this.scrollLines(t);},s([o(0,a.IOptionsService)],r)}(u.Disposable);t.BufferService=h;},994:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.CharsetService=void 0;var r=function(){function e(){this.glevel=0,this._charsets=[];}return e.prototype.reset=function(){this.charset=void 0,this._charsets=[],this.glevel=0;},e.prototype.setgLevel=function(e){this.glevel=e,this.charset=this._charsets[e];},e.prototype.setgCharset=function(e,t){this._charsets[e]=t,this.glevel===e&&(this.charset=t);},e}();t.CharsetService=r;},753:function(e,t,r){var i=this&&this.__decorate||function(e,t,r,i){var n,s=arguments.length,o=s<3?t:null===i?i=Object.getOwnPropertyDescriptor(t,r):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)o=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(n=e[a])&&(o=(s<3?n(o):s>3?n(t,r,o):n(t,r))||o);return s>3&&o&&Object.defineProperty(t,r,o),o},n=this&&this.__param||function(e,t){return function(r,i){t(r,i,e);}},s=this&&this.__values||function(e){var t="function"==typeof Symbol&&Symbol.iterator,r=t&&e[t],i=0;if(r)return r.call(e);if(e&&"number"==typeof e.length)return {next:function(){return e&&i>=e.length&&(e=void 0),{value:e&&e[i++],done:!e}}};throw new TypeError(t?"Object is not iterable.":"Symbol.iterator is not defined.")};Object.defineProperty(t,"__esModule",{value:!0}),t.CoreMouseService=void 0;var o=r(585),a=r(460),c={NONE:{events:0,restrict:function(){return !1}},X10:{events:1,restrict:function(e){return 4!==e.button&&1===e.action&&(e.ctrl=!1,e.alt=!1,e.shift=!1,!0)}},VT200:{events:19,restrict:function(e){return 32!==e.action}},DRAG:{events:23,restrict:function(e){return 32!==e.action||3!==e.button}},ANY:{events:31,restrict:function(e){return !0}}};function f(e,t){var r=(e.ctrl?16:0)|(e.shift?4:0)|(e.alt?8:0);return 4===e.button?(r|=64,r|=e.action):(r|=3&e.button,4&e.button&&(r|=64),8&e.button&&(r|=128),32===e.action?r|=32:0!==e.action||t||(r|=3)),r}var u=String.fromCharCode,h={DEFAULT:function(e){var t=[f(e,!1)+32,e.col+32,e.row+32];return t[0]>255||t[1]>255||t[2]>255?"":"[M"+u(t[0])+u(t[1])+u(t[2])},SGR:function(e){var t=0===e.action&&4!==e.button?"m":"M";return "[<"+f(e,!0)+";"+e.col+";"+e.row+t}},l=function(){function e(e,t){var r,i,n,o;this._bufferService=e,this._coreService=t,this._protocols={},this._encodings={},this._activeProtocol="",this._activeEncoding="",this._onProtocolChange=new a.EventEmitter,this._lastEvent=null;try{for(var f=s(Object.keys(c)),u=f.next();!u.done;u=f.next()){var l=u.value;this.addProtocol(l,c[l]);}}catch(e){r={error:e};}finally{try{u&&!u.done&&(i=f.return)&&i.call(f);}finally{if(r)throw r.error}}try{for(var p=s(Object.keys(h)),_=p.next();!_.done;_=p.next()){var d=_.value;this.addEncoding(d,h[d]);}}catch(e){n={error:e};}finally{try{_&&!_.done&&(o=p.return)&&o.call(p);}finally{if(n)throw n.error}}this.reset();}return e.prototype.addProtocol=function(e,t){this._protocols[e]=t;},e.prototype.addEncoding=function(e,t){this._encodings[e]=t;},Object.defineProperty(e.prototype,"activeProtocol",{get:function(){return this._activeProtocol},set:function(e){if(!this._protocols[e])throw new Error('unknown protocol "'+e+'"');this._activeProtocol=e,this._onProtocolChange.fire(this._protocols[e].events);},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"areMouseEventsActive",{get:function(){return 0!==this._protocols[this._activeProtocol].events},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"activeEncoding",{get:function(){return this._activeEncoding},set:function(e){if(!this._encodings[e])throw new Error('unknown encoding "'+e+'"');this._activeEncoding=e;},enumerable:!1,configurable:!0}),e.prototype.reset=function(){this.activeProtocol="NONE",this.activeEncoding="DEFAULT",this._lastEvent=null;},Object.defineProperty(e.prototype,"onProtocolChange",{get:function(){return this._onProtocolChange.event},enumerable:!1,configurable:!0}),e.prototype.triggerMouseEvent=function(e){if(e.col<0||e.col>=this._bufferService.cols||e.row<0||e.row>=this._bufferService.rows)return !1;if(4===e.button&&32===e.action)return !1;if(3===e.button&&32!==e.action)return !1;if(4!==e.button&&(2===e.action||3===e.action))return !1;if(e.col++,e.row++,32===e.action&&this._lastEvent&&this._compareEvents(this._lastEvent,e))return !1;if(!this._protocols[this._activeProtocol].restrict(e))return !1;var t=this._encodings[this._activeEncoding](e);return t&&("DEFAULT"===this._activeEncoding?this._coreService.triggerBinaryEvent(t):this._coreService.triggerDataEvent(t,!0)),this._lastEvent=e,!0},e.prototype.explainEvents=function(e){return {down:!!(1&e),up:!!(2&e),drag:!!(4&e),move:!!(8&e),wheel:!!(16&e)}},e.prototype._compareEvents=function(e,t){return e.col===t.col&&e.row===t.row&&e.button===t.button&&e.action===t.action&&e.ctrl===t.ctrl&&e.alt===t.alt&&e.shift===t.shift},i([n(0,o.IBufferService),n(1,o.ICoreService)],e)}();t.CoreMouseService=l;},83:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);}),s=this&&this.__decorate||function(e,t,r,i){var n,s=arguments.length,o=s<3?t:null===i?i=Object.getOwnPropertyDescriptor(t,r):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)o=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(n=e[a])&&(o=(s<3?n(o):s>3?n(t,r,o):n(t,r))||o);return s>3&&o&&Object.defineProperty(t,r,o),o},o=this&&this.__param||function(e,t){return function(r,i){t(r,i,e);}};Object.defineProperty(t,"__esModule",{value:!0}),t.CoreService=void 0;var a=r(585),c=r(460),f=r(439),u=r(844),h=Object.freeze({insertMode:!1}),l=Object.freeze({applicationCursorKeys:!1,applicationKeypad:!1,bracketedPasteMode:!1,origin:!1,reverseWraparound:!1,sendFocus:!1,wraparound:!0}),p=function(e){function t(t,r,i,n){var s=e.call(this)||this;return s._bufferService=r,s._logService=i,s._optionsService=n,s.isCursorInitialized=!1,s.isCursorHidden=!1,s._onData=s.register(new c.EventEmitter),s._onUserInput=s.register(new c.EventEmitter),s._onBinary=s.register(new c.EventEmitter),s._scrollToBottom=t,s.register({dispose:function(){return s._scrollToBottom=void 0}}),s.modes=(0, f.clone)(h),s.decPrivateModes=(0, f.clone)(l),s}return n(t,e),Object.defineProperty(t.prototype,"onData",{get:function(){return this._onData.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onUserInput",{get:function(){return this._onUserInput.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onBinary",{get:function(){return this._onBinary.event},enumerable:!1,configurable:!0}),t.prototype.reset=function(){this.modes=(0, f.clone)(h),this.decPrivateModes=(0, f.clone)(l);},t.prototype.triggerDataEvent=function(e,t){if(void 0===t&&(t=!1),!this._optionsService.rawOptions.disableStdin){var r=this._bufferService.buffer;r.ybase!==r.ydisp&&this._scrollToBottom(),t&&this._onUserInput.fire(),this._logService.debug('sending data "'+e+'"',(function(){return e.split("").map((function(e){return e.charCodeAt(0)}))})),this._onData.fire(e);}},t.prototype.triggerBinaryEvent=function(e){this._optionsService.rawOptions.disableStdin||(this._logService.debug('sending binary "'+e+'"',(function(){return e.split("").map((function(e){return e.charCodeAt(0)}))})),this._onBinary.fire(e));},s([o(1,a.IBufferService),o(2,a.ILogService),o(3,a.IOptionsService)],t)}(u.Disposable);t.CoreService=p;},730:function(e,t,r){var i=this&&this.__decorate||function(e,t,r,i){var n,s=arguments.length,o=s<3?t:null===i?i=Object.getOwnPropertyDescriptor(t,r):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)o=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(n=e[a])&&(o=(s<3?n(o):s>3?n(t,r,o):n(t,r))||o);return s>3&&o&&Object.defineProperty(t,r,o),o},n=this&&this.__param||function(e,t){return function(r,i){t(r,i,e);}};Object.defineProperty(t,"__esModule",{value:!0}),t.DirtyRowService=void 0;var s=r(585),o=function(){function e(e){this._bufferService=e,this.clearRange();}return Object.defineProperty(e.prototype,"start",{get:function(){return this._start},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"end",{get:function(){return this._end},enumerable:!1,configurable:!0}),e.prototype.clearRange=function(){this._start=this._bufferService.buffer.y,this._end=this._bufferService.buffer.y;},e.prototype.markDirty=function(e){e<this._start?this._start=e:e>this._end&&(this._end=e);},e.prototype.markRangeDirty=function(e,t){if(e>t){var r=e;e=t,t=r;}e<this._start&&(this._start=e),t>this._end&&(this._end=t);},e.prototype.markAllDirty=function(){this.markRangeDirty(0,this._bufferService.rows-1);},i([n(0,s.IBufferService)],e)}();t.DirtyRowService=o;},348:function(e,t,r){var i=this&&this.__values||function(e){var t="function"==typeof Symbol&&Symbol.iterator,r=t&&e[t],i=0;if(r)return r.call(e);if(e&&"number"==typeof e.length)return {next:function(){return e&&i>=e.length&&(e=void 0),{value:e&&e[i++],done:!e}}};throw new TypeError(t?"Object is not iterable.":"Symbol.iterator is not defined.")},n=this&&this.__read||function(e,t){var r="function"==typeof Symbol&&e[Symbol.iterator];if(!r)return e;var i,n,s=r.call(e),o=[];try{for(;(void 0===t||t-- >0)&&!(i=s.next()).done;)o.push(i.value);}catch(e){n={error:e};}finally{try{i&&!i.done&&(r=s.return)&&r.call(s);}finally{if(n)throw n.error}}return o},s=this&&this.__spreadArray||function(e,t,r){if(r||2===arguments.length)for(var i,n=0,s=t.length;n<s;n++)!i&&n in t||(i||(i=Array.prototype.slice.call(t,0,n)),i[n]=t[n]);return e.concat(i||Array.prototype.slice.call(t))};Object.defineProperty(t,"__esModule",{value:!0}),t.InstantiationService=t.ServiceCollection=void 0;var o=r(585),a=r(343),c=function(){function e(){for(var e,t,r=[],s=0;s<arguments.length;s++)r[s]=arguments[s];this._entries=new Map;try{for(var o=i(r),a=o.next();!a.done;a=o.next()){var c=n(a.value,2),f=c[0],u=c[1];this.set(f,u);}}catch(t){e={error:t};}finally{try{a&&!a.done&&(t=o.return)&&t.call(o);}finally{if(e)throw e.error}}}return e.prototype.set=function(e,t){var r=this._entries.get(e);return this._entries.set(e,t),r},e.prototype.forEach=function(e){this._entries.forEach((function(t,r){return e(r,t)}));},e.prototype.has=function(e){return this._entries.has(e)},e.prototype.get=function(e){return this._entries.get(e)},e}();t.ServiceCollection=c;var f=function(){function e(){this._services=new c,this._services.set(o.IInstantiationService,this);}return e.prototype.setService=function(e,t){this._services.set(e,t);},e.prototype.getService=function(e){return this._services.get(e)},e.prototype.createInstance=function(e){for(var t,r,o=[],c=1;c<arguments.length;c++)o[c-1]=arguments[c];var f=(0, a.getServiceDependencies)(e).sort((function(e,t){return e.index-t.index})),u=[];try{for(var h=i(f),l=h.next();!l.done;l=h.next()){var p=l.value,_=this._services.get(p.id);if(!_)throw new Error("[createInstance] "+e.name+" depends on UNKNOWN service "+p.id+".");u.push(_);}}catch(e){t={error:e};}finally{try{l&&!l.done&&(r=h.return)&&r.call(h);}finally{if(t)throw t.error}}var d=f.length>0?f[0].index:o.length;if(o.length!==d)throw new Error("[createInstance] First service dependency of "+e.name+" at position "+(d+1)+" conflicts with "+o.length+" static arguments");return new(e.bind.apply(e,s([void 0],n(s(s([],n(o),!1),n(u),!1)),!1)))},e}();t.InstantiationService=f;},866:function(e,t,r){var i=this&&this.__decorate||function(e,t,r,i){var n,s=arguments.length,o=s<3?t:null===i?i=Object.getOwnPropertyDescriptor(t,r):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)o=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(n=e[a])&&(o=(s<3?n(o):s>3?n(t,r,o):n(t,r))||o);return s>3&&o&&Object.defineProperty(t,r,o),o},n=this&&this.__param||function(e,t){return function(r,i){t(r,i,e);}},s=this&&this.__read||function(e,t){var r="function"==typeof Symbol&&e[Symbol.iterator];if(!r)return e;var i,n,s=r.call(e),o=[];try{for(;(void 0===t||t-- >0)&&!(i=s.next()).done;)o.push(i.value);}catch(e){n={error:e};}finally{try{i&&!i.done&&(r=s.return)&&r.call(s);}finally{if(n)throw n.error}}return o},o=this&&this.__spreadArray||function(e,t,r){if(r||2===arguments.length)for(var i,n=0,s=t.length;n<s;n++)!i&&n in t||(i||(i=Array.prototype.slice.call(t,0,n)),i[n]=t[n]);return e.concat(i||Array.prototype.slice.call(t))};Object.defineProperty(t,"__esModule",{value:!0}),t.LogService=void 0;var a=r(585),c={debug:a.LogLevelEnum.DEBUG,info:a.LogLevelEnum.INFO,warn:a.LogLevelEnum.WARN,error:a.LogLevelEnum.ERROR,off:a.LogLevelEnum.OFF},f=function(){function e(e){var t=this;this._optionsService=e,this.logLevel=a.LogLevelEnum.OFF,this._updateLogLevel(),this._optionsService.onOptionChange((function(e){"logLevel"===e&&t._updateLogLevel();}));}return e.prototype._updateLogLevel=function(){this.logLevel=c[this._optionsService.rawOptions.logLevel];},e.prototype._evalLazyOptionalParams=function(e){for(var t=0;t<e.length;t++)"function"==typeof e[t]&&(e[t]=e[t]());},e.prototype._log=function(e,t,r){this._evalLazyOptionalParams(r),e.call.apply(e,o([console,"xterm.js: "+t],s(r),!1));},e.prototype.debug=function(e){for(var t=[],r=1;r<arguments.length;r++)t[r-1]=arguments[r];this.logLevel<=a.LogLevelEnum.DEBUG&&this._log(console.log,e,t);},e.prototype.info=function(e){for(var t=[],r=1;r<arguments.length;r++)t[r-1]=arguments[r];this.logLevel<=a.LogLevelEnum.INFO&&this._log(console.info,e,t);},e.prototype.warn=function(e){for(var t=[],r=1;r<arguments.length;r++)t[r-1]=arguments[r];this.logLevel<=a.LogLevelEnum.WARN&&this._log(console.warn,e,t);},e.prototype.error=function(e){for(var t=[],r=1;r<arguments.length;r++)t[r-1]=arguments[r];this.logLevel<=a.LogLevelEnum.ERROR&&this._log(console.error,e,t);},i([n(0,a.IOptionsService)],e)}();t.LogService=f;},302:function(e,t,r){var i=this&&this.__assign||function(){return i=Object.assign||function(e){for(var t,r=1,i=arguments.length;r<i;r++)for(var n in t=arguments[r])Object.prototype.hasOwnProperty.call(t,n)&&(e[n]=t[n]);return e},i.apply(this,arguments)};Object.defineProperty(t,"__esModule",{value:!0}),t.OptionsService=t.DEFAULT_OPTIONS=t.DEFAULT_BELL_SOUND=void 0;var n=r(460),s=r(114);t.DEFAULT_BELL_SOUND="data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjMyLjEwNAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",t.DEFAULT_OPTIONS={cols:80,rows:24,cursorBlink:!1,cursorStyle:"block",cursorWidth:1,customGlyphs:!0,bellSound:t.DEFAULT_BELL_SOUND,bellStyle:"none",drawBoldTextInBrightColors:!0,fastScrollModifier:"alt",fastScrollSensitivity:5,fontFamily:"courier-new, courier, monospace",fontSize:15,fontWeight:"normal",fontWeightBold:"bold",lineHeight:1,linkTooltipHoverDuration:500,letterSpacing:0,logLevel:"info",scrollback:1e3,scrollSensitivity:1,screenReaderMode:!1,macOptionIsMeta:!1,macOptionClickForcesSelection:!1,minimumContrastRatio:1,disableStdin:!1,allowProposedApi:!0,allowTransparency:!1,tabStopWidth:8,theme:{},rightClickSelectsWord:s.isMac,rendererType:"canvas",windowOptions:{},windowsMode:!1,wordSeparator:" ()[]{}',\"`",altClickMovesCursor:!0,convertEol:!1,termName:"xterm",cancelEvents:!1,overviewRulerWidth:void 0};var o=["normal","bold","100","200","300","400","500","600","700","800","900"],a=function(){function e(e){this._onOptionChange=new n.EventEmitter;var r=i({},t.DEFAULT_OPTIONS);for(var s in e)if(s in r)try{var o=e[s];r[s]=this._sanitizeAndValidateOption(s,o);}catch(e){console.error(e);}this.rawOptions=r,this.options=i({},r),this._setupOptions();}return Object.defineProperty(e.prototype,"onOptionChange",{get:function(){return this._onOptionChange.event},enumerable:!1,configurable:!0}),e.prototype._setupOptions=function(){var e=this,r=function(r){if(!(r in t.DEFAULT_OPTIONS))throw new Error('No option with key "'+r+'"');return e.rawOptions[r]},i=function(r,i){if(!(r in t.DEFAULT_OPTIONS))throw new Error('No option with key "'+r+'"');i=e._sanitizeAndValidateOption(r,i),e.rawOptions[r]!==i&&(e.rawOptions[r]=i,e._onOptionChange.fire(r));};for(var n in this.rawOptions){var s={get:r.bind(this,n),set:i.bind(this,n)};Object.defineProperty(this.options,n,s);}},e.prototype.setOption=function(e,t){this.options[e]=t;},e.prototype._sanitizeAndValidateOption=function(e,r){switch(e){case"bellStyle":case"cursorStyle":case"rendererType":case"wordSeparator":r||(r=t.DEFAULT_OPTIONS[e]);break;case"fontWeight":case"fontWeightBold":if("number"==typeof r&&1<=r&&r<=1e3)break;r=o.includes(r)?r:t.DEFAULT_OPTIONS[e];break;case"cursorWidth":r=Math.floor(r);case"lineHeight":case"tabStopWidth":if(r<1)throw new Error(e+" cannot be less than 1, value: "+r);break;case"minimumContrastRatio":r=Math.max(1,Math.min(21,Math.round(10*r)/10));break;case"scrollback":if((r=Math.min(r,4294967295))<0)throw new Error(e+" cannot be less than 0, value: "+r);break;case"fastScrollSensitivity":case"scrollSensitivity":if(r<=0)throw new Error(e+" cannot be less than or equal to 0, value: "+r);case"rows":case"cols":if(!r&&0!==r)throw new Error(e+" must be numeric, value: "+r)}return r},e.prototype.getOption=function(e){return this.options[e]},e}();t.OptionsService=a;},343:(e,t)=>{function r(e,t,r){t.di$target===t?t.di$dependencies.push({id:e,index:r}):(t.di$dependencies=[{id:e,index:r}],t.di$target=t);}Object.defineProperty(t,"__esModule",{value:!0}),t.createDecorator=t.getServiceDependencies=t.serviceRegistry=void 0,t.serviceRegistry=new Map,t.getServiceDependencies=function(e){return e.di$dependencies||[]},t.createDecorator=function(e){if(t.serviceRegistry.has(e))return t.serviceRegistry.get(e);var i=function(e,t,n){if(3!==arguments.length)throw new Error("@IServiceName-decorator can only be used to decorate a parameter");r(i,e,n);};return i.toString=function(){return e},t.serviceRegistry.set(e,i),i};},585:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.IDecorationService=t.IUnicodeService=t.IOptionsService=t.ILogService=t.LogLevelEnum=t.IInstantiationService=t.IDirtyRowService=t.ICharsetService=t.ICoreService=t.ICoreMouseService=t.IBufferService=void 0;var i,n=r(343);t.IBufferService=(0, n.createDecorator)("BufferService"),t.ICoreMouseService=(0, n.createDecorator)("CoreMouseService"),t.ICoreService=(0, n.createDecorator)("CoreService"),t.ICharsetService=(0, n.createDecorator)("CharsetService"),t.IDirtyRowService=(0, n.createDecorator)("DirtyRowService"),t.IInstantiationService=(0, n.createDecorator)("InstantiationService"),(i=t.LogLevelEnum||(t.LogLevelEnum={}))[i.DEBUG=0]="DEBUG",i[i.INFO=1]="INFO",i[i.WARN=2]="WARN",i[i.ERROR=3]="ERROR",i[i.OFF=4]="OFF",t.ILogService=(0, n.createDecorator)("LogService"),t.IOptionsService=(0, n.createDecorator)("OptionsService"),t.IUnicodeService=(0, n.createDecorator)("UnicodeService"),t.IDecorationService=(0, n.createDecorator)("DecorationService");},480:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.UnicodeService=void 0;var i=r(460),n=r(225),s=function(){function e(){this._providers=Object.create(null),this._active="",this._onChange=new i.EventEmitter;var e=new n.UnicodeV6;this.register(e),this._active=e.version,this._activeProvider=e;}return Object.defineProperty(e.prototype,"onChange",{get:function(){return this._onChange.event},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"versions",{get:function(){return Object.keys(this._providers)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"activeVersion",{get:function(){return this._active},set:function(e){if(!this._providers[e])throw new Error('unknown Unicode version "'+e+'"');this._active=e,this._activeProvider=this._providers[e],this._onChange.fire(e);},enumerable:!1,configurable:!0}),e.prototype.register=function(e){this._providers[e.version]=e;},e.prototype.wcwidth=function(e){return this._activeProvider.wcwidth(e)},e.prototype.getStringCellWidth=function(e){for(var t=0,r=e.length,i=0;i<r;++i){var n=e.charCodeAt(i);if(55296<=n&&n<=56319){if(++i>=r)return t+this.wcwidth(n);var s=e.charCodeAt(i);56320<=s&&s<=57343?n=1024*(n-55296)+s-56320+65536:t+=this.wcwidth(s);}t+=this.wcwidth(n);}return t},e}();t.UnicodeService=s;},781:function(e,t,r){var i,n=this&&this.__extends||(i=function(e,t){return i=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t;}||function(e,t){for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r]);},i(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function r(){this.constructor=e;}i(e,t),e.prototype=null===t?Object.create(t):(r.prototype=t.prototype,new r);});Object.defineProperty(t,"__esModule",{value:!0}),t.Terminal=void 0;var s=r(437),o=r(969),a=r(460),c=function(e){function t(t){void 0===t&&(t={});var r=e.call(this,t)||this;return r._onBell=new a.EventEmitter,r._onCursorMove=new a.EventEmitter,r._onTitleChange=new a.EventEmitter,r._onA11yCharEmitter=new a.EventEmitter,r._onA11yTabEmitter=new a.EventEmitter,r._setup(),r.register(r._inputHandler.onRequestBell((function(){return r.bell()}))),r.register(r._inputHandler.onRequestReset((function(){return r.reset()}))),r.register((0, a.forwardEvent)(r._inputHandler.onCursorMove,r._onCursorMove)),r.register((0, a.forwardEvent)(r._inputHandler.onTitleChange,r._onTitleChange)),r.register((0, a.forwardEvent)(r._inputHandler.onA11yChar,r._onA11yCharEmitter)),r.register((0, a.forwardEvent)(r._inputHandler.onA11yTab,r._onA11yTabEmitter)),r}return n(t,e),Object.defineProperty(t.prototype,"options",{get:function(){return this.optionsService.options},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onBell",{get:function(){return this._onBell.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onCursorMove",{get:function(){return this._onCursorMove.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onTitleChange",{get:function(){return this._onTitleChange.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onA11yChar",{get:function(){return this._onA11yCharEmitter.event},enumerable:!1,configurable:!0}),Object.defineProperty(t.prototype,"onA11yTab",{get:function(){return this._onA11yTabEmitter.event},enumerable:!1,configurable:!0}),t.prototype.dispose=function(){this._isDisposed||(e.prototype.dispose.call(this),this.write=function(){});},Object.defineProperty(t.prototype,"buffer",{get:function(){return this.buffers.active},enumerable:!1,configurable:!0}),t.prototype._updateOptions=function(t){e.prototype._updateOptions.call(this,t),"tabStopWidth"===t&&this.buffers.setupTabStops();},Object.defineProperty(t.prototype,"markers",{get:function(){return this.buffer.markers},enumerable:!1,configurable:!0}),t.prototype.addMarker=function(e){if(this.buffer===this.buffers.normal)return this.buffer.addMarker(this.buffer.ybase+this.buffer.y+e)},t.prototype.bell=function(){this._onBell.fire();},t.prototype.resize=function(t,r){t===this.cols&&r===this.rows||e.prototype.resize.call(this,t,r);},t.prototype.clear=function(){if(0!==this.buffer.ybase||0!==this.buffer.y){this.buffer.lines.set(0,this.buffer.lines.get(this.buffer.ybase+this.buffer.y)),this.buffer.lines.length=1,this.buffer.ydisp=0,this.buffer.ybase=0,this.buffer.y=0;for(var e=1;e<this.rows;e++)this.buffer.lines.push(this.buffer.getBlankLine(s.DEFAULT_ATTR_DATA));this._onScroll.fire({position:this.buffer.ydisp,source:0});}},t.prototype.reset=function(){this.options.rows=this.rows,this.options.cols=this.cols,this._setup(),e.prototype.reset.call(this);},t}(o.CoreTerminal);t.Terminal=c;},614:function(e,t,r){var i=this&&this.__assign||function(){return i=Object.assign||function(e){for(var t,r=1,i=arguments.length;r<i;r++)for(var n in t=arguments[r])Object.prototype.hasOwnProperty.call(t,n)&&(e[n]=t[n]);return e},i.apply(this,arguments)},n=this&&this.__values||function(e){var t="function"==typeof Symbol&&Symbol.iterator,r=t&&e[t],i=0;if(r)return r.call(e);if(e&&"number"==typeof e.length)return {next:function(){return e&&i>=e.length&&(e=void 0),{value:e&&e[i++],done:!e}}};throw new TypeError(t?"Object is not iterable.":"Symbol.iterator is not defined.")};Object.defineProperty(t,"__esModule",{value:!0}),t.Terminal=void 0;var s=r(285),o=r(975),a=r(90),c=r(781),f=r(741),u=["cols","rows"],h=function(){function e(e){var t=this;this._core=new c.Terminal(e),this._addonManager=new f.AddonManager,this._publicOptions=i({},this._core.options);var r=function(e){return t._core.options[e]},n=function(e,r){t._checkReadonlyOptions(e),t._core.options[e]=r;},s=function(e){Object.defineProperty(o._publicOptions,e,{get:function(){return t._core.options[e]},set:function(r){t._checkReadonlyOptions(e),t._core.options[e]=r;}});var i={get:r.bind(o,e),set:n.bind(o,e)};Object.defineProperty(o._publicOptions,e,i);},o=this;for(var a in this._core.options)s(a);}return e.prototype._checkReadonlyOptions=function(e){if(u.includes(e))throw new Error('Option "'+e+'" can only be set in the constructor')},e.prototype._checkProposedApi=function(){if(!this._core.optionsService.options.allowProposedApi)throw new Error("You must set the allowProposedApi option to true to use proposed API")},Object.defineProperty(e.prototype,"onBell",{get:function(){return this._core.onBell},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onBinary",{get:function(){return this._core.onBinary},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onCursorMove",{get:function(){return this._core.onCursorMove},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onData",{get:function(){return this._core.onData},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onLineFeed",{get:function(){return this._core.onLineFeed},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onResize",{get:function(){return this._core.onResize},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onScroll",{get:function(){return this._core.onScroll},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"onTitleChange",{get:function(){return this._core.onTitleChange},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"parser",{get:function(){return this._checkProposedApi(),this._parser||(this._parser=new o.ParserApi(this._core)),this._parser},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"unicode",{get:function(){return this._checkProposedApi(),new a.UnicodeApi(this._core)},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"rows",{get:function(){return this._core.rows},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"cols",{get:function(){return this._core.cols},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"buffer",{get:function(){return this._checkProposedApi(),this._buffer||(this._buffer=new s.BufferNamespaceApi(this._core)),this._buffer},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"markers",{get:function(){return this._checkProposedApi(),this._core.markers},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"modes",{get:function(){var e=this._core.coreService.decPrivateModes,t="none";switch(this._core.coreMouseService.activeProtocol){case"X10":t="x10";break;case"VT200":t="vt200";break;case"DRAG":t="drag";break;case"ANY":t="any";}return {applicationCursorKeysMode:e.applicationCursorKeys,applicationKeypadMode:e.applicationKeypad,bracketedPasteMode:e.bracketedPasteMode,insertMode:this._core.coreService.modes.insertMode,mouseTrackingMode:t,originMode:e.origin,reverseWraparoundMode:e.reverseWraparound,sendFocusMode:e.sendFocus,wraparoundMode:e.wraparound}},enumerable:!1,configurable:!0}),Object.defineProperty(e.prototype,"options",{get:function(){return this._publicOptions},set:function(e){for(var t in e)this._publicOptions[t]=e[t];},enumerable:!1,configurable:!0}),e.prototype.resize=function(e,t){this._verifyIntegers(e,t),this._core.resize(e,t);},e.prototype.registerMarker=function(e){return void 0===e&&(e=0),this._checkProposedApi(),this._verifyIntegers(e),this._core.addMarker(e)},e.prototype.addMarker=function(e){return this.registerMarker(e)},e.prototype.dispose=function(){this._addonManager.dispose(),this._core.dispose();},e.prototype.scrollLines=function(e){this._verifyIntegers(e),this._core.scrollLines(e);},e.prototype.scrollPages=function(e){this._verifyIntegers(e),this._core.scrollPages(e);},e.prototype.scrollToTop=function(){this._core.scrollToTop();},e.prototype.scrollToBottom=function(){this._core.scrollToBottom();},e.prototype.scrollToLine=function(e){this._verifyIntegers(e),this._core.scrollToLine(e);},e.prototype.clear=function(){this._core.clear();},e.prototype.write=function(e,t){this._core.write(e,t);},e.prototype.writeUtf8=function(e,t){this._core.write(e,t);},e.prototype.writeln=function(e,t){this._core.write(e),this._core.write("\r\n",t);},e.prototype.getOption=function(e){return this._core.optionsService.getOption(e)},e.prototype.setOption=function(e,t){this._core.optionsService.setOption(e,t);},e.prototype.reset=function(){this._core.reset();},e.prototype.loadAddon=function(e){return this._addonManager.loadAddon(this,e)},e.prototype._verifyIntegers=function(){for(var e,t,r=[],i=0;i<arguments.length;i++)r[i]=arguments[i];try{for(var s=n(r),o=s.next();!o.done;o=s.next()){var a=o.value;if(a===1/0||isNaN(a)||a%1!=0)throw new Error("This API only accepts integers")}}catch(t){e={error:t};}finally{try{o&&!o.done&&(t=s.return)&&t.call(s);}finally{if(e)throw e.error}}},e}();t.Terminal=h;}},t={},r=function r(i){var n=t[i];if(void 0!==n)return n.exports;var s=t[i]={exports:{}};return e[i].call(s.exports,s,s.exports,r),s.exports}(614),i=exports;for(var n in r)i[n]=r[n];r.__esModule&&Object.defineProperty(i,"__esModule",{value:!0});})();
  	
  } (xtermHeadless));

  class Core {
    // public
    constructor(driverFn, opts) {
      this.state = 'initial';
      this.driver = null;
      this.driverFn = driverFn;
      this.changedLines = new Set();
      this.cursor = undefined;
      this.duration = null;
      this.cols = opts.cols;
      this.rows = opts.rows;
      this.startTime = null;
      this.speed = opts.speed || 1.0;
      this.loop = opts.loop;
      this.idleTimeLimit = opts.idleTimeLimit;
      this.preload = opts.preload;
      this.startAt = parseNpt(opts.startAt);
      this.poster = opts.poster;
      this.eventHandlers = new Map([['starting', []], ['waiting', []], ['reset', []], ['play', []], ['pause', []], ['terminalUpdate', []], ['seeked', []], ['ended', []]]);
    }

    addEventListener(eventName, handler) {
      this.eventHandlers.get(eventName).push(handler);
    }

    dispatchEvent(eventName) {
      let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      for (const h of this.eventHandlers.get(eventName)) {
        h(data);
      }
    }

    async init() {
      let playCount = 0;
      const feed = this.feed.bind(this);
      const now = this.now.bind(this);

      const setTimeout = (f, t) => window.setTimeout(f, t / this.speed);

      const setInterval = (f, t) => window.setInterval(f, t / this.speed);

      const reset = (cols, rows) => {
        this.resetVt(cols, rows);
      };

      const onFinish = () => {
        playCount++;

        if (this.loop === true || typeof this.loop === 'number' && playCount < this.loop) {
          this.restart();
        } else {
          this.state = 'finished';
          this.dispatchEvent('ended');
        }
      };

      let wasWaiting = false;

      const setWaiting = isWaiting => {
        if (isWaiting && !wasWaiting) {
          wasWaiting = true;
          this.dispatchEvent('waiting');
        } else if (!isWaiting && wasWaiting) {
          wasWaiting = false;
          this.dispatchEvent('play');
        }
      };

      this.driver = this.driverFn({
        feed,
        now,
        setTimeout,
        setInterval,
        onFinish,
        reset,
        setWaiting
      }, {
        cols: this.cols,
        rows: this.rows,
        idleTimeLimit: this.idleTimeLimit,
        startAt: this.startAt
      });

      if (typeof this.driver === 'function') {
        this.driver = {
          start: this.driver
        };
      }

      this.duration = this.driver.duration;
      this.cols = this.cols ?? this.driver.cols;
      this.rows = this.rows ?? this.driver.rows;

      if (this.preload) {
        this.initializeDriver();
      }

      return {
        isPausable: !!this.driver.pauseOrResume,
        isSeekable: !!this.driver.seek,
        poster: await this.renderPoster()
      };
    }

    async play() {
      if (this.state == 'initial') {
        await this.start();
      } else if (this.state == 'paused') {
        this.resume();
      } else if (this.state == 'finished') {
        this.restart();
      }
    }

    pause() {
      if (this.state == 'playing') {
        this.doPause();
      }
    }

    async pauseOrResume() {
      if (this.state == 'initial') {
        await this.start();
      } else if (this.state == 'playing') {
        this.doPause();
      } else if (this.state == 'paused') {
        this.resume();
      } else if (this.state == 'finished') {
        await this.restart();
      }
    }

    stop() {
      if (typeof this.driver.stop === 'function') {
        this.driver.stop();
      }
    }

    async seek(where) {
      await this.doSeek(where);
      this.dispatchEvent('seeked');
    }

    getChangedLines() {
      if (this.changedLines.size > 0) {
        const lines = new Map();

        for (const i of this.changedLines) {
          lines.set(i, {
            id: i,
            segments: this.vt.get_line(i)
          });
        }

        this.changedLines.clear();
        return lines;
      }
    }

    getCursor() {
      if (this.cursor === undefined && this.vt) {
        this.cursor = this.vt.get_cursor() ?? false;
      }

      return this.cursor;
    }

    getCurrentTime() {
      if (typeof this.driver.getCurrentTime === 'function') {
        return this.driver.getCurrentTime();
      } else if (this.startTime) {
        return (this.now() - this.startTime) / 1000;
      }
    }

    getRemainingTime() {
      if (typeof this.duration === 'number') {
        return this.duration - Math.min(this.getCurrentTime(), this.duration);
      }
    }

    getProgress() {
      if (typeof this.duration === 'number') {
        return Math.min(this.getCurrentTime(), this.duration) / this.duration;
      }
    }

    getDuration() {
      return this.duration;
    } // private


    async start() {
      this.dispatchEvent('starting');
      const timeoutId = setTimeout(() => {
        this.dispatchEvent('waiting');
      }, 2000);
      await this.initializeDriver();
      this.dispatchEvent('terminalUpdate'); // clears the poster

      const stop = await this.driver.start();
      clearTimeout(timeoutId);

      if (typeof stop === 'function') {
        this.driver.stop = stop;
      }

      this.startTime = this.now();
      this.state = 'playing';
      this.dispatchEvent('play');
    }

    doPause() {
      if (typeof this.driver.pauseOrResume === 'function') {
        this.driver.pauseOrResume();
        this.state = 'paused';
        this.dispatchEvent('pause');
      }
    }

    resume() {
      if (typeof this.driver.pauseOrResume === 'function') {
        this.state = 'playing';
        this.driver.pauseOrResume();
        this.dispatchEvent('play');
      }
    }

    async doSeek(where) {
      if (typeof this.driver.seek === 'function') {
        await this.initializeDriver();

        if (this.state != 'playing') {
          this.state = 'paused';
        }

        this.driver.seek(where);
        return true;
      } else {
        return false;
      }
    }

    async restart() {
      if (await this.doSeek(0)) {
        this.resume();
        this.dispatchEvent('play');
      }
    }

    feed(data) {
      const affectedLines = this.vt.feed(data);
      affectedLines.forEach(i => this.changedLines.add(i));
      this.cursor = undefined;
      this.dispatchEvent('terminalUpdate');
    }

    now() {
      return performance.now() * this.speed;
    }

    initializeDriver() {
      if (this.initializeDriverPromise === undefined) {
        this.initializeDriverPromise = this.doInitializeDriver();
      }

      return this.initializeDriverPromise;
    }

    async doInitializeDriver() {
      if (typeof this.driver.init === 'function') {
        const meta = await this.driver.init();
        this.duration = this.duration ?? meta.duration;
        this.cols = this.cols ?? meta.cols;
        this.rows = this.rows ?? meta.rows;
      }

      this.ensureVt();
    }

    ensureVt() {
      const cols = this.cols || 80;
      const rows = this.rows || 24;

      if (this.vt !== undefined && this.vt.cols === cols && this.vt.rows === rows) {
        return;
      }

      this.initializeVt(cols, rows);
    }

    resetVt(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.initializeVt(cols, rows);
    }

    initializeVt(cols, rows) {
      let terminal = new xtermHeadless.Terminal({
        cols: cols,
        rows: rows,
        scrollback: 0,
        windowsMode: true
      });
      let wasReset = false;
      let dirtyStart = 0;
      let dirtyEnd = 0;

      terminal._core._inputHandler.onRequestRefreshRows((start, end) => {
        dirtyStart = Math.max(start - 1, 0);
        dirtyEnd = Math.min(end + 1, rows - 1);
      }); // @TODO: do we need to handle the buffer changed event?


      this.vt = {
        feed: data => {
          terminal.write(data);

          if (data === "\x1bc") {
            wasReset = true; // the terminal was reset, so mark all rows as dirty

            let result = new Array(rows);

            for (let i = 0; i < rows; i++) {
              result[i] = i;
            }

            return result;
          } else {
            if (wasReset) {
              // the terminal was reset, so mark all rows as dirty
              wasReset = false;
              let result = new Array(rows);

              for (let i = 0; i < rows; i++) {
                result[i] = i;
              }

              return result;
            }

            let count = dirtyEnd - dirtyStart + 1;
            let result = new Array(count);

            for (let i = 0; i < count; i++) {
              result[i] = dirtyStart + i;
            }

            return result;
          }
        },
        get_line: idx => {
          let result = [];
          const buf = terminal.buffer.active;
          const line = buf.getLine(idx);

          if (line) {
            let cell = null;
            const L = line.length;

            for (let i = 0; i < L; i++) {
              cell = line.getCell(i, cell);
              result.push([cell.getChars(), new Map([cell.isFgDefault() ? [] : ["fg", cell.getFgColor()], cell.isBgDefault() ? [] : ["bg", cell.getBgColor()], cell.isBold() ? ['bold', true] : [], cell.isItalic() ? ['italic', true] : [], cell.isUnderline() ? ['underline', true] : [], cell.isStrikethrough() ? ['strikethrough', true] : [], cell.isBlink() ? ['blink', true] : [], cell.isInverse() ? ['inverse', true] : []].filter(x => x.length > 0))]);
            }
          }

          return result;
        },
        get_cursor: () => {
          let buf = terminal.buffer.active;
          return [buf.cursorX, buf.cursorY - buf.baseY];
        }
      };
      this.vt.cols = cols;
      this.vt.rows = rows;
      this.changedLines.clear();

      for (let i = 0; i < rows; i++) {
        this.changedLines.add(i);
      }

      this.dispatchEvent('reset', {
        cols,
        rows
      });
    }

    async renderPoster() {
      if (!this.poster) return;
      this.ensureVt();
      let poster = [];

      if (this.poster.substring(0, 16) == "data:text/plain,") {
        poster = [this.poster.substring(16)];
      } else if (this.poster.substring(0, 4) == 'npt:' && typeof this.driver.getPoster === 'function') {
        await this.initializeDriver();
        poster = this.driver.getPoster(this.parseNptPoster(this.poster));
      }

      poster.forEach(text => this.vt.feed(text));
      const cursor = this.getCursor();
      const lines = [];

      for (let i = 0; i < this.vt.rows; i++) {
        lines.push({
          id: i,
          segments: this.vt.get_line(i)
        });
        this.changedLines.add(i);
      }

      this.vt.feed('\x1bc'); // reset vt

      this.cursor = undefined;
      return {
        cursor: cursor,
        lines: lines
      };
    }

    parseNptPoster(poster) {
      return parseNpt(poster.substring(4));
    }

  }

  const $RAW = Symbol("store-raw"),
        $NODE = Symbol("store-node"),
        $NAME = Symbol("store-name");
  function wrap$1(value, name) {
    let p = value[$PROXY];
    if (!p) {
      Object.defineProperty(value, $PROXY, {
        value: p = new Proxy(value, proxyTraps$1)
      });
      if (!Array.isArray(value)) {
        const keys = Object.keys(value),
              desc = Object.getOwnPropertyDescriptors(value);
        for (let i = 0, l = keys.length; i < l; i++) {
          const prop = keys[i];
          if (desc[prop].get) {
            const get = desc[prop].get.bind(p);
            Object.defineProperty(value, prop, {
              get
            });
          }
        }
      }
    }
    return p;
  }
  function isWrappable(obj) {
    let proto;
    return obj != null && typeof obj === "object" && (obj[$PROXY] || !(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype || Array.isArray(obj));
  }
  function unwrap(item, set = new Set()) {
    let result, unwrapped, v, prop;
    if (result = item != null && item[$RAW]) return result;
    if (!isWrappable(item) || set.has(item)) return item;
    if (Array.isArray(item)) {
      if (Object.isFrozen(item)) item = item.slice(0);else set.add(item);
      for (let i = 0, l = item.length; i < l; i++) {
        v = item[i];
        if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
      }
    } else {
      if (Object.isFrozen(item)) item = Object.assign({}, item);else set.add(item);
      const keys = Object.keys(item),
            desc = Object.getOwnPropertyDescriptors(item);
      for (let i = 0, l = keys.length; i < l; i++) {
        prop = keys[i];
        if (desc[prop].get) continue;
        v = item[prop];
        if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
      }
    }
    return item;
  }
  function getDataNodes(target) {
    let nodes = target[$NODE];
    if (!nodes) Object.defineProperty(target, $NODE, {
      value: nodes = {}
    });
    return nodes;
  }
  function getDataNode(nodes, property, value) {
    return nodes[property] || (nodes[property] = createDataNode(value));
  }
  function proxyDescriptor(target, property) {
    const desc = Reflect.getOwnPropertyDescriptor(target, property);
    if (!desc || desc.get || !desc.configurable || property === $PROXY || property === $NODE || property === $NAME) return desc;
    delete desc.value;
    delete desc.writable;
    desc.get = () => target[$PROXY][property];
    return desc;
  }
  function trackSelf(target) {
    if (getListener()) {
      const nodes = getDataNodes(target);
      (nodes._ || (nodes._ = createDataNode()))();
    }
  }
  function ownKeys(target) {
    trackSelf(target);
    return Reflect.ownKeys(target);
  }
  function createDataNode(value) {
    const [s, set] = createSignal(value, {
      equals: false,
      internal: true
    });
    s.$ = set;
    return s;
  }
  const proxyTraps$1 = {
    get(target, property, receiver) {
      if (property === $RAW) return target;
      if (property === $PROXY) return receiver;
      if (property === $TRACK) {
        trackSelf(target);
        return receiver;
      }
      const nodes = getDataNodes(target);
      const tracked = nodes.hasOwnProperty(property);
      let value = tracked ? nodes[property]() : target[property];
      if (property === $NODE || property === "__proto__") return value;
      if (!tracked) {
        const desc = Object.getOwnPropertyDescriptor(target, property);
        if (getListener() && (typeof value !== "function" || target.hasOwnProperty(property)) && !(desc && desc.get)) value = getDataNode(nodes, property, value)();
      }
      return isWrappable(value) ? wrap$1(value) : value;
    },
    has(target, property) {
      if (property === $RAW || property === $PROXY || property === $TRACK || property === $NODE || property === "__proto__") return true;
      const tracked = getDataNodes(target)[property];
      tracked && tracked();
      return property in target;
    },
    set() {
      return true;
    },
    deleteProperty() {
      return true;
    },
    ownKeys: ownKeys,
    getOwnPropertyDescriptor: proxyDescriptor
  };
  function setProperty(state, property, value, deleting = false) {
    if (!deleting && state[property] === value) return;
    const prev = state[property];
    const len = state.length;
    if (value === undefined) {
      delete state[property];
    } else state[property] = value;
    let nodes = getDataNodes(state),
        node;
    if (node = getDataNode(nodes, property, prev)) node.$(() => value);
    if (Array.isArray(state) && state.length !== len) (node = getDataNode(nodes, "length", len)) && node.$(state.length);
    (node = nodes._) && node.$();
  }
  function mergeStoreNode(state, value) {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      setProperty(state, key, value[key]);
    }
  }
  function updateArray(current, next) {
    if (typeof next === "function") next = next(current);
    next = unwrap(next);
    if (Array.isArray(next)) {
      if (current === next) return;
      let i = 0,
          len = next.length;
      for (; i < len; i++) {
        const value = next[i];
        if (current[i] !== value) setProperty(current, i, value);
      }
      setProperty(current, "length", len);
    } else mergeStoreNode(current, next);
  }
  function updatePath(current, path, traversed = []) {
    let part,
        prev = current;
    if (path.length > 1) {
      part = path.shift();
      const partType = typeof part,
            isArray = Array.isArray(current);
      if (Array.isArray(part)) {
        for (let i = 0; i < part.length; i++) {
          updatePath(current, [part[i]].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "function") {
        for (let i = 0; i < current.length; i++) {
          if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "object") {
        const {
          from = 0,
          to = current.length - 1,
          by = 1
        } = part;
        for (let i = from; i <= to; i += by) {
          updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (path.length > 1) {
        updatePath(current[part], path, [part].concat(traversed));
        return;
      }
      prev = current[part];
      traversed = [part].concat(traversed);
    }
    let value = path[0];
    if (typeof value === "function") {
      value = value(prev, traversed);
      if (value === prev) return;
    }
    if (part === undefined && value == undefined) return;
    value = unwrap(value);
    if (part === undefined || isWrappable(prev) && isWrappable(value) && !Array.isArray(value)) {
      mergeStoreNode(prev, value);
    } else setProperty(current, part, value);
  }
  function createStore(...[store, options]) {
    const unwrappedStore = unwrap(store || {});
    const isArray = Array.isArray(unwrappedStore);
    const wrappedStore = wrap$1(unwrappedStore);
    function setStore(...args) {
      batch(() => {
        isArray && args.length === 1 ? updateArray(unwrappedStore, args[0]) : updatePath(unwrappedStore, args);
      });
    }
    return [wrappedStore, setStore];
  }

  const $ROOT = Symbol("store-root");
  function applyState(target, parent, property, merge, key) {
    const previous = parent[property];
    if (target === previous) return;
    if (!isWrappable(target) || !isWrappable(previous) || key && target[key] !== previous[key]) {
      if (target !== previous) {
        if (property === $ROOT) return target;
        setProperty(parent, property, target);
      }
      return;
    }
    if (Array.isArray(target)) {
      if (target.length && previous.length && (!merge || key && target[0][key] != null)) {
        let i, j, start, end, newEnd, item, newIndicesNext, keyVal;
        for (start = 0, end = Math.min(previous.length, target.length); start < end && (previous[start] === target[start] || key && previous[start][key] === target[start][key]); start++) {
          applyState(target[start], previous, start, merge, key);
        }
        const temp = new Array(target.length),
              newIndices = new Map();
        for (end = previous.length - 1, newEnd = target.length - 1; end >= start && newEnd >= start && (previous[end] === target[newEnd] || key && previous[end][key] === target[newEnd][key]); end--, newEnd--) {
          temp[newEnd] = previous[end];
        }
        if (start > newEnd || start > end) {
          for (j = start; j <= newEnd; j++) setProperty(previous, j, target[j]);
          for (; j < target.length; j++) {
            setProperty(previous, j, temp[j]);
            applyState(target[j], previous, j, merge, key);
          }
          if (previous.length > target.length) setProperty(previous, "length", target.length);
          return;
        }
        newIndicesNext = new Array(newEnd + 1);
        for (j = newEnd; j >= start; j--) {
          item = target[j];
          keyVal = key ? item[key] : item;
          i = newIndices.get(keyVal);
          newIndicesNext[j] = i === undefined ? -1 : i;
          newIndices.set(keyVal, j);
        }
        for (i = start; i <= end; i++) {
          item = previous[i];
          keyVal = key ? item[key] : item;
          j = newIndices.get(keyVal);
          if (j !== undefined && j !== -1) {
            temp[j] = previous[i];
            j = newIndicesNext[j];
            newIndices.set(keyVal, j);
          }
        }
        for (j = start; j < target.length; j++) {
          if (j in temp) {
            setProperty(previous, j, temp[j]);
            applyState(target[j], previous, j, merge, key);
          } else setProperty(previous, j, target[j]);
        }
      } else {
        for (let i = 0, len = target.length; i < len; i++) {
          applyState(target[i], previous, i, merge, key);
        }
      }
      if (previous.length > target.length) setProperty(previous, "length", target.length);
      return;
    }
    const targetKeys = Object.keys(target);
    for (let i = 0, len = targetKeys.length; i < len; i++) {
      applyState(target[targetKeys[i]], previous, targetKeys[i], merge, key);
    }
    const previousKeys = Object.keys(previous);
    for (let i = 0, len = previousKeys.length; i < len; i++) {
      if (target[previousKeys[i]] === undefined) setProperty(previous, previousKeys[i], undefined);
    }
  }
  function reconcile(value, options = {}) {
    const {
      merge,
      key = "id"
    } = options,
          v = unwrap(value);
    return state => {
      if (!isWrappable(state) || !isWrappable(v)) return v;
      const res = applyState(v, {
        [$ROOT]: state
      }, $ROOT, merge, key);
      return res === undefined ? state : res;
    };
  }

  const _tmpl$$6 = /*#__PURE__*/template(`<span></span>`);

  var Segment = (props => {
    return (() => {
      const _el$ = _tmpl$$6.cloneNode(true);

      insert(_el$, () => props.text);

      createRenderEffect(_p$ => {
        const _v$ = className(props.attrs, props.extraClass),
              _v$2 = style(props.attrs);

        _v$ !== _p$._v$ && className$1(_el$, _p$._v$ = _v$);
        _p$._v$2 = style$1(_el$, _v$2, _p$._v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });

      return _el$;
    })();
  });

  function className(attrs, extraClass) {
    const fg = attrs.get('inverse') ? attrs.has('bg') ? attrs.get('bg') : 'bg' : attrs.get('fg');
    const bg = attrs.get('inverse') ? attrs.has('fg') ? attrs.get('fg') : 'fg' : attrs.get('bg');
    const fgClass = colorClass(fg, attrs.get('bold'), 'fg-');
    const bgClass = colorClass(bg, attrs.get('blink'), 'bg-');
    let cls = extraClass ?? '';

    if (fgClass) {
      cls += ' ' + fgClass;
    }

    if (bgClass) {
      cls += ' ' + bgClass;
    }

    if (attrs.has('bold')) {
      cls += ' bright';
    }

    if (attrs.has('italic')) {
      cls += ' italic';
    }

    if (attrs.has('underline')) {
      cls += ' underline';
    }

    if (attrs.has('blink')) {
      cls += ' blink';
    }

    return cls;
  }

  function colorClass(color, intense, prefix) {
    if (typeof color === 'number') {
      if (intense && color < 8) {
        color += 8;
      }

      return `${prefix}${color}`;
    } else if (color == 'fg' || color == 'bg') {
      return `${prefix}${color}`;
    }
  }

  function style(attrs) {
    const fg = attrs.get('inverse') ? attrs.get('bg') : attrs.get('fg');
    const bg = attrs.get('inverse') ? attrs.get('fg') : attrs.get('bg');
    let style = {};

    if (typeof fg === 'string') {
      style['color'] = fg;
    }

    if (typeof bg === 'string') {
      style['background-color'] = bg;
    }

    return style;
  }

  const _tmpl$$5 = /*#__PURE__*/template(`<span class="line"></span>`);
  var Line = (props => {
    const segments = () => {
      if (typeof props.cursor === 'number') {
        const segs = [];
        let len = 0;
        let i = 0;

        while (i < props.segments.length && len + props.segments[i][0].length - 1 < props.cursor) {
          const seg = props.segments[i];
          segs.push(seg);
          len += seg[0].length;
          i++;
        }

        if (i < props.segments.length) {
          const seg = props.segments[i];
          const cursorAttrsA = seg[1];
          const cursorAttrsB = new Map(cursorAttrsA);
          cursorAttrsB.set('inverse', !cursorAttrsB.get('inverse'));
          const pos = props.cursor - len;

          if (pos > 0) {
            segs.push([seg[0].substring(0, pos), seg[1]]);
          }

          segs.push([seg[0][pos], cursorAttrsA, ' cursor-a']);
          segs.push([seg[0][pos], cursorAttrsB, ' cursor-b']);

          if (pos < seg[0].length - 1) {
            segs.push([seg[0].substring(pos + 1), seg[1]]);
          }

          i++;

          while (i < props.segments.length) {
            const seg = props.segments[i];
            segs.push(seg);
            i++;
          }
        }

        return segs;
      } else {
        return props.segments;
      }
    };

    return (() => {
      const _el$ = _tmpl$$5.cloneNode(true);

      insert(_el$, createComponent(Index, {
        get each() {
          return segments();
        },

        children: s => createComponent(Segment, {
          get text() {
            return s()[0];
          },

          get attrs() {
            return s()[1];
          },

          get extraClass() {
            return s()[2];
          }

        })
      }));

      createRenderEffect(() => _el$.style.setProperty("height", props.height));

      return _el$;
    })();
  });

  const _tmpl$$4 = /*#__PURE__*/template(`<pre class="asciinema-terminal"></pre>`);
  var Terminal = (props => {
    const lineHeight = () => props.lineHeight ?? 1.3333333333;

    const terminalStyle = createMemo(() => {
      return {
        width: `${props.cols}ch`,
        height: `${lineHeight() * props.rows}em`,
        "font-size": `${(props.scale || 1.0) * 100}%`,
        "font-family": props.fontFamily,
        "line-height": `${lineHeight()}em`
      };
    });

    const cursorCol = () => {
      var _props$cursor;

      return (_props$cursor = props.cursor) === null || _props$cursor === void 0 ? void 0 : _props$cursor[0];
    };

    const cursorRow = () => {
      var _props$cursor2;

      return (_props$cursor2 = props.cursor) === null || _props$cursor2 === void 0 ? void 0 : _props$cursor2[1];
    };

    return (() => {
      const _el$ = _tmpl$$4.cloneNode(true);

      const _ref$ = props.ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : props.ref = _el$;

      insert(_el$, createComponent(For, {
        get each() {
          return props.lines;
        },

        children: (line, i) => createComponent(Line, {
          get segments() {
            return line.segments;
          },

          get cursor() {
            return memo(() => i() === cursorRow(), true)() ? cursorCol() : null;
          },

          get height() {
            return `${lineHeight()}em`;
          }

        })
      }));

      createRenderEffect(_p$ => {
        const _v$ = !!(props.blink || props.cursorHold),
              _v$2 = !!props.blink,
              _v$3 = terminalStyle();

        _v$ !== _p$._v$ && _el$.classList.toggle("cursor", _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && _el$.classList.toggle("blink", _p$._v$2 = _v$2);
        _p$._v$3 = style$1(_el$, _v$3, _p$._v$3);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined
      });

      return _el$;
    })();
  });

  const _tmpl$$3 = /*#__PURE__*/template(`<svg version="1.1" viewBox="0 0 12 12" class="icon"><path d="M1,0 L4,0 L4,12 L1,12 Z"></path><path d="M8,0 L11,0 L11,12 L8,12 Z"></path></svg>`),
        _tmpl$2 = /*#__PURE__*/template(`<svg version="1.1" viewBox="0 0 12 12" class="icon"><path d="M1,0 L11,6 L1,12 Z"></path></svg>`),
        _tmpl$3 = /*#__PURE__*/template(`<span class="playback-button"></span>`),
        _tmpl$4 = /*#__PURE__*/template(`<span class="progressbar"><span class="bar"><span class="gutter"><span></span></span></span></span>`),
        _tmpl$5 = /*#__PURE__*/template(`<div class="control-bar"><span class="timer"><span class="time-elapsed"></span><span class="time-remaining"></span></span><span class="fullscreen-button" title="Toggle fullscreen mode"><svg version="1.1" viewBox="0 0 12 12" class="icon"><path d="M12,0 L7,0 L9,2 L7,4 L8,5 L10,3 L12,5 Z"></path><path d="M0,12 L0,7 L2,9 L4,7 L5,8 L3,10 L5,12 Z"></path></svg><svg version="1.1" viewBox="0 0 12 12" class="icon"><path d="M7,5 L7,0 L9,2 L11,0 L12,1 L10,3 L12,5 Z"></path><path d="M5,7 L0,7 L2,9 L0,11 L1,12 L3,10 L5,12 Z"></path></svg></span></div>`);

  function formatTime(seconds) {
    seconds = Math.floor(seconds);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    let time = '';

    if (m < 10) {
      time += '0';
    }

    time += `${m}:`;

    if (s < 10) {
      time += '0';
    }

    time += `${s}`;
    return time;
  }

  var ControlBar = (props => {
    const e = f => {
      return e => {
        e.preventDefault();
        f(e);
      };
    };

    const currentTime = () => typeof props.currentTime === 'number' ? formatTime(props.currentTime) : '--:--';

    const remainingTime = () => typeof props.remainingTime === 'number' ? '-' + formatTime(props.remainingTime) : currentTime();

    const gutterBarStyle = () => {
      return {
        width: "100%",
        transform: `scaleX(${props.progress || 0}`,
        "transform-origin": "left center"
      };
    };

    const onSeek = e => {
      if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) {
        return;
      }

      const barWidth = e.currentTarget.offsetWidth;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const pos = mouseX / barWidth;
      return props.onSeekClick(`${pos * 100}%`);
    };

    return (() => {
      const _el$ = _tmpl$5.cloneNode(true),
            _el$5 = _el$.firstChild,
            _el$6 = _el$5.firstChild,
            _el$7 = _el$6.nextSibling,
            _el$8 = _el$5.nextSibling;

      insert(_el$, createComponent(Show, {
        get when() {
          return props.isPausable;
        },

        get children() {
          const _el$2 = _tmpl$3.cloneNode(true);

          addEventListener(_el$2, "click", e(props.onPlayClick), true);

          insert(_el$2, createComponent(Switch, {
            get children() {
              return [createComponent(Match, {
                get when() {
                  return props.isPlaying;
                },

                get children() {
                  return _tmpl$$3.cloneNode(true);
                }

              }), createComponent(Match, {
                get when() {
                  return !props.isPlaying;
                },

                get children() {
                  return _tmpl$2.cloneNode(true);
                }

              })];
            }

          }));

          return _el$2;
        }

      }), _el$5);

      insert(_el$6, currentTime);

      insert(_el$7, remainingTime);

      addEventListener(_el$8, "click", e(props.onFullscreenClick), true);

      insert(_el$, createComponent(Show, {
        get when() {
          return typeof props.progress === 'number' || props.isSeekable;
        },

        get children() {
          const _el$9 = _tmpl$4.cloneNode(true),
                _el$10 = _el$9.firstChild,
                _el$11 = _el$10.firstChild,
                _el$12 = _el$11.firstChild;

          _el$10.$$mousedown = onSeek;

          createRenderEffect(_$p => style$1(_el$12, gutterBarStyle(), _$p));

          return _el$9;
        }

      }), null);

      createRenderEffect(() => _el$.classList.toggle("seekable", !!props.isSeekable));

      return _el$;
    })();
  });

  delegateEvents(["click", "mousedown"]);

  const _tmpl$$2 = /*#__PURE__*/template(`<div class="loading"></div>`);
  var LoaderOverlay = (props => {
    const symbols = ['▓', '▒', '░', '▒'];
    let intervalId;
    let i = 1;
    let paddingText = '';

    for (let c = 0; c < props.cols - 1; c++) {
      paddingText = paddingText.concat(' ');
    }

    const padding = [paddingText, new Map()];
    const attrs = new Map([['inverse', true]]);
    const line = {
      segments: [padding, [symbols[0], attrs]]
    };
    const [state, setState] = createStore({
      lines: [line]
    });
    onMount(() => {
      intervalId = setInterval(() => {
        const symbol = symbols[i % symbols.length];
        const line = {
          segments: [padding, [symbol, attrs]]
        };
        setState('lines', 0, line);
        i++;
      }, 250);
    });
    onCleanup(() => {
      clearInterval(intervalId);
    });
    return (() => {
      const _el$ = _tmpl$$2.cloneNode(true);

      insert(_el$, createComponent(Terminal, {
        get cols() {
          return props.cols;
        },

        get rows() {
          return props.rows;
        },

        get scale() {
          return props.scale;
        },

        get lines() {
          return state.lines;
        },

        get fontFamily() {
          return props.terminalFontFamily;
        },

        get lineHeight() {
          return props.terminalLineHeight;
        }

      }));

      return _el$;
    })();
  });

  const _tmpl$$1 = /*#__PURE__*/template(`<div class="start-prompt"><div class="play-button"><div><span><svg version="1.1" viewBox="0 0 866.0254037844387 866.0254037844387" class="icon"><defs><mask id="small-triangle-mask"><rect width="100%" height="100%" fill="white"></rect><polygon points="508.01270189221935 433.01270189221935, 208.0127018922194 259.8076211353316, 208.01270189221927 606.217782649107" fill="black"></polygon></mask></defs><polygon points="808.0127018922194 433.01270189221935, 58.01270189221947 -1.1368683772161603e-13, 58.01270189221913 866.0254037844386" mask="url(#small-triangle-mask)" fill="white" class="play-btn-fill"></polygon><polyline points="481.2177826491071 333.0127018922194, 134.80762113533166 533.0127018922194" stroke="white" stroke-width="90" class="play-btn-stroke"></polyline></svg></span></div></div></div>`);

  var StartOverlay = (props => {
    const e = f => {
      return e => {
        e.preventDefault();
        f(e);
      };
    };

    return (() => {
      const _el$ = _tmpl$$1.cloneNode(true);

      addEventListener(_el$, "click", e(props.onClick), true);

      return _el$;
    })();
  });

  delegateEvents(["click"]);

  const _tmpl$ = /*#__PURE__*/template(`<div class="asciinema-player-wrapper" tabindex="-1"><div></div></div>`);
  var Player = (props => {
    const core = props.core;
    const autoPlay = props.autoPlay;
    const [state, setState] = createStore({
      coreState: 'initial',
      cols: props.cols,
      rows: props.rows,
      lines: [],
      cursor: undefined,
      charW: null,
      charH: null,
      bordersW: null,
      bordersH: null,
      containerW: null,
      containerH: null,
      showControls: false,
      showStartOverlay: !autoPlay,
      isPausable: true,
      isSeekable: true,
      isFullscreen: false,
      currentTime: null,
      remainingTime: null,
      progress: null,
      blink: true,
      cursorHold: false
    });

    const terminalCols = () => state.cols || 80;

    const terminalRows = () => state.rows || 24;

    let frameRequestId;
    let userActivityTimeoutId;
    let timeUpdateIntervalId;
    let blinkIntervalId;
    let wrapperRef;
    let playerRef;
    let terminalRef;
    let resizeObserver;
    core.addEventListener('starting', () => {
      setState('showStartOverlay', false);
    });
    core.addEventListener('waiting', () => {
      setState('coreState', 'waiting');
    });
    core.addEventListener('reset', _ref => {
      let {
        cols,
        rows
      } = _ref;

      if (rows < state.rows) {
        setState('lines', state.lines.slice(0, rows));
      }

      setState({
        cols,
        rows
      });
    });
    core.addEventListener('play', () => {
      setState({
        coreState: 'playing',
        showStartOverlay: false
      });
    });
    core.addEventListener('pause', () => {
      setState('coreState', 'paused');
    });
    core.addEventListener('seeked', () => {
      updateTime();
    });
    core.addEventListener('ended', () => {
      setState('coreState', 'paused');
    });
    core.addEventListener('terminalUpdate', () => {
      if (frameRequestId === undefined) {
        frameRequestId = requestAnimationFrame(updateTerminal);
      }
    });

    const measureDomElements = () => {
      setState({
        charW: terminalRef.clientWidth / terminalCols(),
        charH: terminalRef.clientHeight / terminalRows(),
        bordersW: terminalRef.offsetWidth - terminalRef.clientWidth,
        bordersH: terminalRef.offsetHeight - terminalRef.clientHeight,
        containerW: wrapperRef.offsetWidth,
        containerH: wrapperRef.offsetHeight
      });
    };

    const setupResizeObserver = () => {
      resizeObserver = new ResizeObserver(_entries => {
        setState({
          containerW: wrapperRef.offsetWidth,
          containerH: wrapperRef.offsetHeight
        });
        wrapperRef.dispatchEvent(new CustomEvent('resize', {
          detail: {
            el: playerRef
          }
        }));
      });
      resizeObserver.observe(wrapperRef);
    };

    onMount(async () => {
      console.debug('player mounted');
      measureDomElements();
      setupResizeObserver();
      const {
        isPausable,
        isSeekable,
        poster
      } = await core.init();
      setState({
        isPausable,
        isSeekable
      });

      if (poster !== undefined && !autoPlay) {
        setState({
          lines: poster.lines,
          cursor: poster.cursor
        });
      }

      if (autoPlay) {
        core.play();
      }
    });
    onCleanup(() => {
      core.stop();
      stopBlinking();
      stopTimeUpdates();
      resizeObserver.disconnect();
    });
    createEffect(() => {
      const s = state.coreState;

      if (s === 'playing') {
        startBlinking();
        startTimeUpdates();
      } else if (s !== 'initial') {
        stopBlinking();
        stopTimeUpdates();
        updateTime();
      }
    });

    const updateTerminal = () => {
      const changedLines = core.getChangedLines();

      if (changedLines) {
        changedLines.forEach((line, i) => {
          setState('lines', i, reconcile(line));
        });
      }

      setState('cursor', reconcile(core.getCursor()));
      setState('cursorHold', true);
      frameRequestId = undefined;
    };

    const terminalSize = createMemo(() => {
      if (!state.charW) {
        return;
      }

      console.debug(`containerW = ${state.containerW}`);
      const terminalW = state.charW * terminalCols() + state.bordersW;
      const terminalH = state.charH * terminalRows() + state.bordersH;
      let fit = props.fit ?? 'width';

      if (fit === 'both' || state.isFullscreen) {
        const containerRatio = state.containerW / state.containerH;
        const terminalRatio = terminalW / terminalH;

        if (containerRatio > terminalRatio) {
          fit = 'height';
        } else {
          fit = 'width';
        }
      }

      if (fit === false || fit === 'none') {
        return {};
      } else if (fit === 'width') {
        const scale = state.containerW / terminalW;
        return {
          scale: scale,
          width: state.containerW,
          height: terminalH * scale
        };
      } else if (fit === 'height') {
        const scale = state.containerH / terminalH;
        return {
          scale: scale,
          width: terminalW * scale,
          height: state.containerH
        };
      } else {
        throw `unsupported fit mode: ${fit}`;
      }
    });

    const onFullscreenChange = () => {
      setState('isFullscreen', document.fullscreenElement ?? document.webkitFullscreenElement);
    };

    const toggleFullscreen = () => {
      if (state.isFullscreen) {
        (document.exitFullscreen ?? document.webkitExitFullscreen ?? (() => {})).apply(document);
      } else {
        (wrapperRef.requestFullscreen ?? wrapperRef.webkitRequestFullscreen ?? (() => {})).apply(wrapperRef);
      }
    };

    const onKeyPress = e => {
      if (e.altKey || e.metaKey || e.ctrlKey) {
        return;
      }

      if (e.shiftKey) {
        if (e.key == 'ArrowLeft') {
          core.seek('<<<');
        } else if (e.key == 'ArrowRight') {
          core.seek('>>>');
        } else {
          return;
        }

        e.preventDefault();
        return;
      }

      if (e.key == ' ') {
        core.pauseOrResume();
      } else if (e.key == 'f') {
        toggleFullscreen();
      } else if (e.key == 'ArrowLeft') {
        core.seek('<<');
      } else if (e.key == 'ArrowRight') {
        core.seek('>>');
      } else if (e.key.charCodeAt(0) >= 48 && e.key.charCodeAt(0) <= 57) {
        const pos = (e.key.charCodeAt(0) - 48) / 10;
        core.seek(`${pos * 100}%`);
      } else {
        return;
      }

      e.preventDefault();
    };

    const wrapperOnMouseMove = () => {
      if (state.isFullscreen) {
        showControls(true);
      }
    };

    const playerOnMouseLeave = () => {
      if (!state.isFullscreen) {
        showControls(false);
      }
    };

    const startTimeUpdates = () => {
      timeUpdateIntervalId = setInterval(updateTime, 100);
    };

    const stopTimeUpdates = () => {
      clearInterval(timeUpdateIntervalId);
    };

    const updateTime = () => {
      const currentTime = core.getCurrentTime();
      const remainingTime = core.getRemainingTime();
      const progress = core.getProgress();
      setState({
        currentTime,
        remainingTime,
        progress
      });
    };

    const startBlinking = () => {
      blinkIntervalId = setInterval(() => {
        setState(state => {
          const changes = {
            blink: !state.blink
          };

          if (changes.blink) {
            changes.cursorHold = false;
          }

          return changes;
        });
      }, 500);
    };

    const stopBlinking = () => {
      clearInterval(blinkIntervalId);
      setState('blink', true);
    };

    const showControls = show => {
      clearTimeout(userActivityTimeoutId);

      if (show) {
        userActivityTimeoutId = setTimeout(() => showControls(false), 2000);
      }

      setState('showControls', show);
    };

    const playerStyle = () => {
      const style = {};

      if ((props.fit === false || props.fit === 'none') && props.terminalFontSize !== undefined) {
        if (props.terminalFontSize === 'small') {
          style['font-size'] = '12px';
        } else if (props.terminalFontSize === 'medium') {
          style['font-size'] = '18px';
        } else if (props.terminalFontSize === 'big') {
          style['font-size'] = '24px';
        } else {
          style['font-size'] = props.terminalFontSize;
        }
      }

      const size = terminalSize();

      if (size === undefined) {
        style['height'] = 0;
        return style;
      }

      if (size.width !== undefined) {
        style['width'] = `${size.width}px`;
        style['height'] = `${size.height}px`;
      }

      return style;
    };

    const playerClass = () => `asciinema-player asciinema-theme-${props.theme ?? 'asciinema'}`;

    const terminalScale = () => {
      var _terminalSize;

      return (_terminalSize = terminalSize()) === null || _terminalSize === void 0 ? void 0 : _terminalSize.scale;
    };

    const el = (() => {
      const _el$ = _tmpl$.cloneNode(true),
            _el$2 = _el$.firstChild;

      const _ref$ = wrapperRef;
      typeof _ref$ === "function" ? use(_ref$, _el$) : wrapperRef = _el$;

      _el$.addEventListener("webkitfullscreenchange", onFullscreenChange);

      _el$.addEventListener("fullscreenchange", onFullscreenChange);

      _el$.$$mousemove = wrapperOnMouseMove;
      _el$.$$keydown = onKeyPress;

      _el$.addEventListener("keypress", onKeyPress);

      const _ref$2 = playerRef;
      typeof _ref$2 === "function" ? use(_ref$2, _el$2) : playerRef = _el$2;

      _el$2.$$mousemove = () => showControls(true);

      _el$2.addEventListener("mouseleave", playerOnMouseLeave);

      insert(_el$2, createComponent(Terminal, {
        get cols() {
          return terminalCols();
        },

        get rows() {
          return terminalRows();
        },

        get scale() {
          return terminalScale();
        },

        get blink() {
          return state.blink;
        },

        get lines() {
          return state.lines;
        },

        get cursor() {
          return state.cursor;
        },

        get cursorHold() {
          return state.cursorHold;
        },

        get fontFamily() {
          return props.terminalFontFamily;
        },

        get lineHeight() {
          return props.terminalLineHeight;
        },

        ref(r$) {
          const _ref$3 = terminalRef;
          typeof _ref$3 === "function" ? _ref$3(r$) : terminalRef = r$;
        }

      }), null);

      insert(_el$2, createComponent(ControlBar, {
        get currentTime() {
          return state.currentTime;
        },

        get remainingTime() {
          return state.remainingTime;
        },

        get progress() {
          return state.progress;
        },

        get isPlaying() {
          return state.coreState == 'playing';
        },

        get isPausable() {
          return state.isPausable;
        },

        get isSeekable() {
          return state.isSeekable;
        },

        onPlayClick: () => core.pauseOrResume(),
        onFullscreenClick: toggleFullscreen,
        onSeekClick: pos => core.seek(pos)
      }), null);

      insert(_el$2, createComponent(Switch, {
        get children() {
          return [createComponent(Match, {
            get when() {
              return state.showStartOverlay;
            },

            get children() {
              return createComponent(StartOverlay, {
                onClick: () => core.play()
              });
            }

          }), createComponent(Match, {
            get when() {
              return state.coreState == 'waiting';
            },

            get children() {
              return createComponent(LoaderOverlay, {
                get cols() {
                  return terminalCols();
                },

                get rows() {
                  return terminalRows();
                },

                get scale() {
                  return terminalScale();
                },

                get terminalFontFamily() {
                  return props.terminalFontFamily;
                },

                get terminalLineHeight() {
                  return props.terminalLineHeight;
                }

              });
            }

          })];
        }

      }), null);

      createRenderEffect(_p$ => {
        const _v$ = !!state.showControls,
              _v$2 = playerClass(),
              _v$3 = playerStyle();

        _v$ !== _p$._v$ && _el$.classList.toggle("hud", _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && className$1(_el$2, _p$._v$2 = _v$2);
        _p$._v$3 = style$1(_el$2, _v$3, _p$._v$3);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined
      });

      return _el$;
    })();

    return el;
  });

  delegateEvents(["keydown", "mousemove"]);

  // Efficient array transformations without intermediate array objects.
  // Inspired by Clojure's transducers and Elixir's streams.
  class Stream {
    constructor(input, xfs) {
      this.input = input;
      this.xfs = xfs ?? [];
    }

    map(f) {
      return this.transform(Map$1(f));
    }

    flatMap(f) {
      return this.transform(FlatMap(f));
    }

    filter(f) {
      return this.transform(Filter(f));
    }

    take(n) {
      return this.transform(Take(n));
    }

    drop(n) {
      return this.transform(Drop(n));
    }

    transform(f) {
      return new Stream(this.input, this.xfs.concat([f]));
    }

    toArray() {
      return Array.from(this);
    }

    [Symbol.iterator]() {
      let i = 0;
      let v = 0;
      let values = [];
      let flushed = false;
      const xf = compose(this.xfs, val => values.push(val));
      return {
        next: () => {
          if (v === values.length) {
            values = [];
            v = 0;
          }

          while (values.length === 0 && i < this.input.length) {
            xf.step(this.input[i++]);
          }

          if (values.length === 0 && !flushed) {
            xf.flush();
            flushed = true;
          }

          if (values.length > 0) {
            return {
              done: false,
              value: values[v++]
            };
          } else {
            return {
              done: true
            };
          }
        }
      };
    }

  }

  function Map$1(f) {
    return emit => {
      return input => {
        emit(f(input));
      };
    };
  }

  function FlatMap(f) {
    return emit => {
      return input => {
        f(input).forEach(emit);
      };
    };
  }

  function Filter(f) {
    return emit => {
      return input => {
        if (f(input)) {
          emit(input);
        }
      };
    };
  }

  function Take(n) {
    let c = 0;
    return emit => {
      return input => {
        if (c < n) {
          emit(input);
        }

        c += 1;
      };
    };
  }

  function Drop(n) {
    let c = 0;
    return emit => {
      return input => {
        c += 1;

        if (c > n) {
          emit(input);
        }
      };
    };
  }

  function compose(xfs, push) {
    return xfs.reverse().reduce((next, curr) => {
      const xf = toXf(curr(next.step));
      return {
        step: xf.step,
        flush: () => {
          xf.flush();
          next.flush();
        }
      };
    }, toXf(push));
  }

  function toXf(xf) {
    if (typeof xf === 'function') {
      return {
        step: xf,
        flush: () => {}
      };
    } else {
      return xf;
    }
  }

  // TODO rename to file driver

  function asciicast(src, _ref, _ref2) {
    let {
      feed,
      now,
      setTimeout,
      onFinish
    } = _ref;
    let {
      idleTimeLimit,
      startAt
    } = _ref2;
    let cols;
    let rows;
    let frames;
    let duration;
    let effectiveStartAt;
    let timeoutId;
    let nextFrameIndex = 0;
    let elapsedVirtualTime = 0;
    let startTime;
    let pauseElapsedTime;

    async function load() {
      if (frames) return;
      const asciicast = loadAsciicast(await doFetch(src));
      cols = asciicast.cols;
      rows = asciicast.rows;
      idleTimeLimit = idleTimeLimit ?? asciicast.idleTimeLimit;
      const result = prepareFrames(asciicast.frames, idleTimeLimit, startAt);
      frames = result.frames;

      if (frames.length === 0) {
        throw 'asciicast is missing events';
      }

      effectiveStartAt = result.effectiveStartAt;
      duration = frames[frames.length - 1][0];
    }

    async function doFetch(_ref3) {
      let {
        url,
        data,
        fetchOpts = {}
      } = _ref3;

      if (url !== undefined) {
        const response = await fetch(url, fetchOpts);

        if (!response.ok) {
          throw `failed fetching asciicast file: ${response.statusText} (${response.status})`;
        }

        return await response.text();
      } else if (data !== undefined) {
        if (typeof data === 'function') {
          data = data();
        }

        return await data;
      } else {
        throw 'failed fetching asciicast file: url/data missing in src';
      }
    }

    function scheduleNextFrame() {
      const nextFrame = frames[nextFrameIndex];

      if (nextFrame) {
        const t = nextFrame[0] * 1000;
        const elapsedWallTime = now() - startTime;
        let timeout = t - elapsedWallTime;

        if (timeout < 0) {
          timeout = 0;
        }

        timeoutId = setTimeout(runFrame, timeout);
      } else {
        timeoutId = null;
        pauseElapsedTime = duration * 1000;
        onFinish();
      }
    }

    function runFrame() {
      let frame = frames[nextFrameIndex];
      let elapsedWallTime;

      do {
        feed(frame[1]);
        elapsedVirtualTime = frame[0] * 1000;
        frame = frames[++nextFrameIndex];
        elapsedWallTime = now() - startTime;
      } while (frame && elapsedWallTime > frame[0] * 1000);

      scheduleNextFrame();
    }

    function pause() {
      clearTimeout(timeoutId);
      timeoutId = null;
      pauseElapsedTime = now() - startTime;
    }

    function resume() {
      startTime = now() - pauseElapsedTime;
      pauseElapsedTime = null;
      scheduleNextFrame();
    }

    function seek(where) {
      const isPlaying = !!timeoutId;

      if (isPlaying) {
        pause();
      }

      if (typeof where === 'string') {
        const currentTime = (pauseElapsedTime ?? 0) / 1000;

        if (where === '<<') {
          where = currentTime - 5;
        } else if (where === '>>') {
          where = currentTime + 5;
        } else if (where === '<<<') {
          where = currentTime - 0.1 * duration;
        } else if (where === '>>>') {
          where = currentTime + 0.1 * duration;
        } else if (where[where.length - 1] === '%') {
          where = parseFloat(where.substring(0, where.length - 1)) / 100 * duration;
        }
      }

      const targetTime = Math.min(Math.max(where, 0), duration) * 1000;

      if (targetTime < elapsedVirtualTime) {
        feed('\x1bc'); // reset terminal

        nextFrameIndex = 0;
        elapsedVirtualTime = 0;
      }

      let frame = frames[nextFrameIndex];

      while (frame && frame[0] * 1000 < targetTime) {
        feed(frame[1]);
        elapsedVirtualTime = frame[0] * 1000;
        frame = frames[++nextFrameIndex];
      }

      pauseElapsedTime = targetTime;

      if (isPlaying) {
        resume();
      }
    }

    function getPoster(time) {
      const posterTime = time * 1000;
      const poster = [];
      let nextFrameIndex = 0;
      let frame = frames[0];

      while (frame && frame[0] * 1000 < posterTime) {
        poster.push(frame[1]);
        frame = frames[++nextFrameIndex];
      }

      return poster;
    }

    return {
      init: async () => {
        await load();
        return {
          cols,
          rows,
          duration
        };
      },
      start: async () => {
        seek(effectiveStartAt);
        resume();
      },
      stop: () => {
        clearTimeout(timeoutId);
      },
      pauseOrResume: () => {
        if (timeoutId) {
          pause();
          return false;
        } else {
          resume();
          return true;
        }
      },
      seek: where => {
        return seek(where);
      },
      getPoster: t => {
        return getPoster(t);
      },
      getCurrentTime: () => {
        if (timeoutId) {
          return (now() - startTime) / 1000;
        } else {
          return (pauseElapsedTime ?? 0) / 1000;
        }
      }
    };
  }

  function loadAsciicast(data) {
    let header;
    let events = new Stream([]);

    if (typeof data === 'string') {
      const result = parseJsonl(data);

      if (result !== undefined) {
        header = result.header;
        events = result.events;
      } else {
        header = JSON.parse(data);
      }
    } else if (typeof data === 'object' && typeof data.version === 'number') {
      header = data;
    } else if (Array.isArray(data)) {
      header = data[0];
      events = new Stream(data).drop(1);
    } else {
      throw 'invalid data';
    }

    if (header.version === 1) {
      return buildAsciicastV1(header);
    } else if (header.version === 2) {
      return buildAsciicastV2(header, events);
    } else {
      throw `asciicast v${header.version} format not supported`;
    }
  }

  function parseJsonl(jsonl) {
    const lines = jsonl.split('\n');
    let header;

    try {
      header = JSON.parse(lines[0]);
    } catch (_error) {
      return;
    }

    const events = new Stream(lines).drop(1).filter(l => l[0] === '[').map(l => JSON.parse(l));
    return {
      header,
      events
    };
  }

  function buildAsciicastV1(data) {
    let time = 0;
    const frames = new Stream(data.stdout).map(e => {
      time += e[0];
      return [time, e[1]];
    });
    return {
      cols: data.width,
      rows: data.height,
      frames: frames
    };
  }

  function buildAsciicastV2(header, events) {
    const frames = events.filter(e => e[1] === 'o').map(e => [e[0], e[2]]);
    return {
      cols: header.width,
      rows: header.height,
      idleTimeLimit: header.idle_time_limit,
      frames: frames
    };
  }

  function batchFrames(frames) {
    const maxFrameTime = 1.0 / 60;
    let prevFrame;
    return frames.transform(emit => {
      let ic = 0;
      let oc = 0;
      return {
        step: frame => {
          ic++;

          if (prevFrame === undefined) {
            prevFrame = frame;
            return;
          }

          if (frame[0] - prevFrame[0] < maxFrameTime) {
            prevFrame[1] += frame[1];
          } else {
            emit(prevFrame);
            prevFrame = frame;
            oc++;
          }
        },
        flush: () => {
          if (prevFrame !== undefined) {
            emit(prevFrame);
            oc++;
          }

          console.debug(`batched ${ic} frames to ${oc} frames`);
        }
      };
    });
  }

  function prepareFrames(frames) {
    let idleTimeLimit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : Infinity;
    let startAt = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    let prevT = 0;
    let shift = 0;
    let effectiveStartAt = startAt;
    const fs = Array.from(batchFrames(frames).map(e => {
      const delay = e[0] - prevT;
      const delta = delay - idleTimeLimit;
      prevT = e[0];

      if (delta > 0) {
        shift += delta;

        if (e[0] < startAt) {
          effectiveStartAt -= delta;
        }
      }

      return [e[0] - shift, e[1]];
    }));
    return {
      frames: fs,
      effectiveStartAt: effectiveStartAt
    };
  }

  function test(_ref, callbacks, opts) {
    let {
      kind
    } = _ref;

    if (kind == 'random') {
      return random(callbacks);
    } else if (kind == 'clock') {
      return clock(callbacks, opts);
    }
  }

  function random(_ref2) {
    let {
      feed,
      setTimeout
    } = _ref2;
    const base = ' '.charCodeAt(0);
    const range = '~'.charCodeAt(0) - base;
    let timeoutId;

    const schedule = () => {
      const t = Math.pow(5, Math.random() * 4);
      timeoutId = setTimeout(print, t);
    };

    const print = () => {
      schedule();
      const char = String.fromCharCode(base + Math.floor(Math.random() * range));
      feed(char);
    };

    return () => {
      schedule();
      return () => clearInterval(timeoutId);
    };
  }

  function clock(_ref3, _ref4) {
    let {
      feed
    } = _ref3;
    let {
      cols = 5,
      rows = 1
    } = _ref4;
    const middleRow = Math.floor(rows / 2);
    const leftPad = Math.floor(cols / 2) - 2;
    let intervalId;
    return {
      cols: cols,
      rows: rows,
      duration: 24 * 60,
      start: () => {
        setTimeout(() => {
          feed(`\x1b[?25l\x1b[1m\x1b[${middleRow}B`);
        }, 0);
        intervalId = setInterval(() => {
          const d = new Date();
          const h = d.getHours();
          const m = d.getMinutes();
          feed('\r');

          for (let i = 0; i < leftPad; i++) {
            feed(' ');
          }

          feed('\x1b[32m');

          if (h < 10) {
            feed('0');
          }

          feed(`${h}`);
          feed('\x1b[39;5m:\x1b[25;35m');

          if (m < 10) {
            feed('0');
          }

          feed(`${m}`);
        }, 1000);
      },
      stop: () => {
        clearInterval(intervalId);
      },
      getCurrentTime: () => {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes();
      }
    };
  }

  class Queue {
    constructor() {
      this.first = undefined;
      this.last = undefined;
      this.onPush = undefined;
    }

    push(item) {
      const node = {
        item: item
      };

      if (this.last !== undefined) {
        this.last = this.last.next = node;
      } else {
        this.last = this.first = node;
      }

      if (this.onPush) {
        this.onPush(this.pop());
        this.onPush = undefined;
      }
    }

    pop() {
      const node = this.first;

      if (node !== undefined) {
        this.first = node.next;

        if (this.first === undefined) {
          this.last = undefined;
        }

        return node.item;
      } else {
        const thiz = this;
        return new Promise(resolve => {
          thiz.onPush = resolve;
        });
      }
    }

    forEach(f) {
      let stop = false;

      const go = async () => {
        let item = this.pop();

        while (typeof item !== 'object' || typeof item.then !== 'function') {
          if (stop) return;
          await f(item);
          item = this.pop();
        }

        item = await item;
        if (stop) return;
        await f(item);
        go();
      };

      setTimeout(go, 0);
      return () => {
        stop = true;
      };
    }

  }

  function getBuffer(feed, bufferTime) {
    if (bufferTime > 0) {
      return buffer(feed, bufferTime);
    } else {
      return nullBuffer(feed);
    }
  }

  function nullBuffer(feed) {
    return {
      pushEvent(event) {
        if (event[1] === 'o') {
          feed(event[2]);
        }
      },

      pushText(text) {
        feed(text);
      },

      stop() {}

    };
  }

  function buffer(feed, bufferTime) {
    const events = new Queue();
    let startTime;
    const stopFeeding = events.forEach(async event => {
      const elapsedWallTime = now() - startTime;
      const elapsedStreamTime = (event[0] + bufferTime) * 1000;

      if (elapsedStreamTime > elapsedWallTime) {
        await sleep(elapsedStreamTime - elapsedWallTime);
      }

      feed(event[2]);
    });
    return {
      pushEvent(event) {
        if (startTime === undefined) {
          startTime = now();
        }

        if (event[1] != 'o') return;
        events.push(event);
      },

      pushText(text) {
        if (startTime === undefined) {
          startTime = now();
        }

        const time = (now() - startTime) / 1000;
        events.push([time, 'o', text]);
      },

      stop() {
        stopFeeding();
      }

    };
  }

  function now() {
    return new Date().getTime();
  }

  function sleep(t) {
    return new Promise(resolve => {
      setTimeout(resolve, t);
    });
  }

  function websocket(_ref, _ref2) {
    let {
      url,
      bufferTime = 0
    } = _ref;
    let {
      feed,
      reset,
      setWaiting,
      onFinish
    } = _ref2;
    const utfDecoder = new TextDecoder();
    let socket;
    let buf;
    let reconnectDelay = 250;
    let stop = false;

    function initBuffer() {
      if (buf !== undefined) buf.stop();
      buf = getBuffer(feed, bufferTime);
    }

    function connect() {
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        console.debug('websocket: opened');
        setWaiting(false);
        initBuffer();
        reconnectDelay = 250;
      };

      socket.onmessage = event => {
        if (typeof event.data === 'string') {
          const e = JSON.parse(event.data);

          if (e.cols !== undefined || e.width !== undefined) {
            initBuffer();
            reset(e.cols ?? e.width, e.rows ?? e.height);
          } else {
            buf.pushEvent(e);
          }
        } else {
          buf.pushText(utfDecoder.decode(event.data));
        }
      };

      socket.onclose = event => {
        if (stop || event.code === 1000 || event.code === 1005) {
          console.debug('websocket: closed');
          onFinish();
        } else {
          console.debug(`websocket: unclean close, reconnecting in ${reconnectDelay}...`);
          setWaiting(true);
          setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 5000);
        }
      };
    }

    return {
      start: () => {
        connect();
      },
      stop: () => {
        stop = true;
        if (buf !== undefined) buf.stop();
        if (socket !== undefined) socket.close();
      }
    };
  }

  function eventsource(_ref, _ref2) {
    let {
      url,
      bufferTime = 0
    } = _ref;
    let {
      feed,
      reset,
      setWaiting,
      onFinish
    } = _ref2;
    let es;
    let buf;

    function initBuffer() {
      if (buf !== undefined) buf.stop();
      buf = getBuffer(feed, bufferTime);
    }

    return {
      start: () => {
        es = new EventSource(url);
        es.addEventListener('open', () => {
          console.debug('eventsource: opened');
          setWaiting(false);
          initBuffer();
        });
        es.addEventListener('error', e => {
          console.debug('eventsource: errored');
          console.debug(e);
          setWaiting(true);
        });
        es.addEventListener('message', event => {
          const e = JSON.parse(event.data);

          if (e.cols !== undefined || e.width !== undefined) {
            initBuffer();
            reset(e.cols ?? e.width, e.rows ?? e.height);
          } else {
            buf.pushEvent(e);
          }
        });
        es.addEventListener('done', () => {
          console.debug('eventsource: closed');
          es.close();
          onFinish();
        });
      },
      stop: () => {
        if (buf !== undefined) buf.stop();
        if (es !== undefined) es.close();
      }
    };
  }

  function create(src, elem) {
    let opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    const core = new Core(getDriver(src), {
      cols: opts.cols,
      rows: opts.rows,
      loop: opts.loop,
      speed: opts.speed,
      preload: opts.preload,
      startAt: opts.startAt,
      poster: opts.poster,
      idleTimeLimit: opts.idleTimeLimit
    });
    const props = {
      core: core,
      cols: opts.cols,
      rows: opts.rows,
      fit: opts.fit,
      autoPlay: opts.autoPlay ?? opts.autoplay,
      terminalFontSize: opts.terminalFontSize,
      terminalFontFamily: opts.terminalFontFamily,
      terminalLineHeight: opts.terminalLineHeight,
      theme: opts.theme
    };
    let el;
    const dispose = render(() => {
      el = createComponent(Player, props);
      return el;
    }, elem);
    const player = {
      el: el,
      dispose: dispose,
      getCurrentTime: () => core.getCurrentTime(),
      getDuration: () => core.getDuration(),
      play: () => core.play(),
      pause: () => core.pause(),
      seek: pos => core.seek(pos)
    };

    player.addEventListener = (name, callback) => {
      return core.addEventListener(name, callback.bind(player));
    };

    return player;
  }

  function getDriver(src) {
    if (typeof src === 'string') {
      if (src.substring(0, 5) == 'ws://' || src.substring(0, 6) == 'wss://') {
        src = {
          driver: 'websocket',
          url: src
        };
      } else if (src.substring(0, 7) == 'test://') {
        src = {
          driver: 'test',
          kind: src.substring(7)
        };
      } else {
        src = {
          driver: 'asciicast',
          url: src
        };
      }
    }

    if (src.driver === undefined) {
      src.driver = 'asciicast';
    }

    const drivers = new Map([['asciicast', asciicast], ['websocket', websocket], ['eventsource', eventsource], ['test', test]]);

    if (typeof src === 'function') {
      return src;
    } else if (drivers.has(src.driver)) {
      const driver = drivers.get(src.driver);
      return (callbacks, opts) => driver(src, callbacks, opts);
    } else {
      throw `unsupported driver: ${JSON.stringify(src)}`;
    }
  }

  exports.create = create;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

})({});
