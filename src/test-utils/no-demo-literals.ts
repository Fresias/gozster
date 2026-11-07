import * as React from "react";

/**
 * Lista canónica de literales de ejemplo / fallback prohibidos en modo en vivo (FIX-08).
 * Referencia: docs/ux-ui-review/07-revision-implementacion.md §3 P0-1, P0-2 y §8 FIX-08.
 */
export const FORBIDDEN_DEMO_LITERALS = [
  "28 oct: agarre neutro",
  "Landmine Press 3x10 25 kg",
  "Lucas M.",
  "Valentina R.",
  "Sofía G.",
  "Martín P.",
  "Camila D.",
] as const;

export type ForbiddenDemoLiteral = (typeof FORBIDDEN_DEMO_LITERALS)[number];

/**
 * Verifica que un contenedor DOM renderizado en modo en vivo no contenga ningún literal
 * de ejemplo del fallback estático. Lanza un Error de aserción descriptivo si detecta alguno.
 */
export function assertNoDemoLiteralsInLiveMode(
  container: HTMLElement | { textContent?: string | null; innerHTML?: string | null } | string,
  extraForbiddenLiterals: readonly string[] = []
): void {
  if (!container) {
    throw new Error(
      "assertNoDemoLiteralsInLiveMode: se recibió un contenedor nulo o indefinido."
    );
  }

  const textContent =
    typeof container === "string"
      ? container
      : `${container.textContent ?? ""}\n${container.innerHTML ?? ""}`;

  const literalsToCheck = [...FORBIDDEN_DEMO_LITERALS, ...extraForbiddenLiterals];

  for (const literal of literalsToCheck) {
    if (textContent.includes(literal)) {
      throw new Error(
        `[FIX-08] Literal de demo filtrado en modo en vivo: "${literal}". ` +
          `El árbol DOM renderizado con datos reales no debe incluir constantes de ejemplo del fallback.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Lightweight DOM + React Test Renderer (Testing Library compatible in Node)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toKebabDataAttr(propKey: string): string {
  return propKey;
}

function dataAttrToCamel(attrName: string): string {
  return attrName
    .replace(/^data-/, "")
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export class TestTextNode {
  public nodeType = 3;
  public textContent: string;
  public parentElement: TestHTMLElement | null = null;

  constructor(text: string) {
    this.textContent = text;
  }

  get outerHTML(): string {
    return escapeHtml(this.textContent);
  }
}

export class TestHTMLElement {
  public nodeType = 1;
  public tagName: string;
  public parentElement: TestHTMLElement | null = null;
  public childNodes: Array<TestHTMLElement | TestTextNode> = [];
  public __reactProps: Record<string, any> = {};
  public __refresh?: () => void;
  public dataset: Record<string, string> = {};
  public style: Record<string, any> = {};
  public open = false;
  private attrs: Map<string, string> = new Map();

  constructor(tagName: string, reactProps: Record<string, any> = {}) {
    this.tagName = tagName.toUpperCase();
    this.__reactProps = reactProps;
    this.syncAttributesFromProps(reactProps);
  }

  private syncAttributesFromProps(props: Record<string, any>) {
    for (const [key, rawVal] of Object.entries(props)) {
      if (
        key === "children" ||
        key === "key" ||
        key === "ref" ||
        key === "dangerouslySetInnerHTML" ||
        key === "style" ||
        typeof rawVal === "function" ||
        rawVal === undefined ||
        rawVal === null
      ) {
        continue;
      }

      if (key === "className") {
        if (typeof rawVal === "string") {
          this.setAttribute("class", rawVal);
        }
        continue;
      }

      if (key === "htmlFor") {
        this.setAttribute("for", String(rawVal));
        continue;
      }

      if (key === "tabIndex") {
        this.setAttribute("tabindex", String(rawVal));
        continue;
      }

      if (key === "defaultValue" && !this.attrs.has("value")) {
        this.setAttribute("value", String(rawVal));
        continue;
      }

      if (typeof rawVal === "boolean") {
        if (key.startsWith("aria-") || key.startsWith("data-")) {
          this.setAttribute(key, String(rawVal));
        } else if (rawVal) {
          this.setAttribute(key.toLowerCase(), "");
          if (key === "open") this.open = true;
        }
        continue;
      }

      if (typeof rawVal === "string" || typeof rawVal === "number") {
        const attrName =
          key.startsWith("data-") || key.startsWith("aria-")
            ? toKebabDataAttr(key)
            : key === "viewBox"
            ? "viewBox"
            : key.toLowerCase();
        this.setAttribute(attrName, String(rawVal));
      }
    }
  }

  get id(): string {
    return this.attrs.get("id") ?? "";
  }

  set id(val: string) {
    this.setAttribute("id", val);
  }

  get className(): string {
    return this.attrs.get("class") ?? "";
  }

  set className(val: string) {
    this.setAttribute("class", val);
  }

  get value(): string {
    if (this.__reactProps.value !== undefined && this.__reactProps.value !== null) {
      return String(this.__reactProps.value);
    }
    return this.attrs.get("value") ?? "";
  }

  set value(val: string) {
    this.__reactProps = { ...this.__reactProps, value: val };
    this.setAttribute("value", val);
  }

  get disabled(): boolean {
    return Boolean(this.__reactProps.disabled || this.attrs.has("disabled"));
  }

  get checked(): boolean {
    return Boolean(this.__reactProps.checked || this.attrs.has("checked"));
  }

  get children(): TestHTMLElement[] {
    return this.childNodes.filter(
      (n): n is TestHTMLElement => n instanceof TestHTMLElement
    );
  }

  get textContent(): string {
    if (this.tagName === "TEXTAREA" && this.value) {
      const childText = this.childNodes.map((c) => c.textContent).join("");
      return childText || this.value;
    }
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val: string) {
    this.childNodes = val ? [new TestTextNode(val)] : [];
  }

  get innerHTML(): string {
    if (this.__reactProps?.dangerouslySetInnerHTML?.__html) {
      return String(this.__reactProps.dangerouslySetInnerHTML.__html);
    }
    if (this.tagName === "TEXTAREA" && this.childNodes.length === 0 && this.value) {
      return escapeHtml(this.value);
    }
    return this.childNodes.map((c) => c.outerHTML).join("");
  }

  set innerHTML(html: string) {
    this.childNodes = [ new TestRawHtmlNode(html) as unknown as TestTextNode ];
  }

  get outerHTML(): string {
    const tag = this.tagName.toLowerCase();
    const attrPairs: string[] = [];
    for (const [k, v] of this.attrs.entries()) {
      if (tag === "textarea" && k === "value") continue;
      if (v === "") {
        attrPairs.push(`${k}=""`);
      } else {
        attrPairs.push(`${k}="${escapeHtml(v)}"`);
      }
    }
    const attrStr = attrPairs.length > 0 ? " " + attrPairs.join(" ") : "";
    return `<${tag}${attrStr}>${this.innerHTML}</${tag}>`;
  }

  appendChild(child: TestHTMLElement | TestTextNode) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  getAttribute(name: string): string | null {
    const key = name === "viewBox" ? "viewBox" : name.toLowerCase();
    return this.attrs.has(key) ? this.attrs.get(key)! : null;
  }

  setAttribute(name: string, value: string): void {
    const key = name === "viewBox" ? "viewBox" : name.toLowerCase();
    this.attrs.set(key, value);
    if (key.startsWith("data-")) {
      this.dataset[dataAttrToCamel(key)] = value;
    }
  }

  removeAttribute(name: string): void {
    const key = name.toLowerCase();
    this.attrs.delete(key);
    if (key.startsWith("data-")) {
      delete this.dataset[dataAttrToCamel(key)];
    }
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name.toLowerCase());
  }

  contains(other: TestHTMLElement | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    for (const child of this.children) {
      if (child.contains(other)) return true;
    }
    return false;
  }

  showModal(): void {
    this.open = true;
    this.setAttribute("open", "");
  }

  close(): void {
    this.open = false;
    this.removeAttribute("open");
    if (typeof this.__reactProps.onClose === "function") {
      this.__reactProps.onClose({ target: this, currentTarget: this });
    }
  }

  focus(): void {
    if (typeof this.__reactProps.onFocus === "function") {
      this.__reactProps.onFocus({ target: this, currentTarget: this });
    }
  }

  blur(): void {
    if (typeof this.__reactProps.onBlur === "function") {
      this.__reactProps.onBlur({ target: this, currentTarget: this });
    }
  }

  click(): void {
    if (this.disabled) return;
    if (typeof this.__reactProps.onClick === "function") {
      this.__reactProps.onClick({
        target: this,
        currentTarget: this,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    }
  }

  matches(selector: string): boolean {
    const parts = selector
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.some((part) => this.matchesSingleSelector(part));
  }

  private matchesSingleSelector(sel: string): boolean {
    const segments = sel.split(/\s+/).filter(Boolean);
    if (segments.length > 1) {
      const last = segments[segments.length - 1]!;
      if (!this.matchesCompound(last)) return false;
      let curr: TestHTMLElement | null = this.parentElement;
      for (let i = segments.length - 2; i >= 0; i--) {
        const needed = segments[i]!;
        while (curr && !curr.matchesCompound(needed)) {
          curr = curr.parentElement;
        }
        if (!curr) return false;
        curr = curr.parentElement;
      }
      return true;
    }
    return this.matchesCompound(sel);
  }

  private matchesCompound(compound: string): boolean {
    let rem = compound.trim();
    if (!rem) return false;

    if (rem.includes(":not([disabled])")) {
      if (this.disabled) return false;
      rem = rem.replace(":not([disabled])", "");
    }

    const attrRegex = /\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(rem)) !== null) {
      const attrName = match[1]!;
      const expectedVal = match[2];
      const actualVal = this.getAttribute(attrName);
      if (expectedVal !== undefined) {
        if (actualVal !== expectedVal) return false;
      } else {
        if (!this.hasAttribute(attrName)) return false;
      }
    }
    rem = rem.replace(attrRegex, "").trim();

    if (!rem || rem === "*") return true;

    const idMatch = rem.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      if (this.id !== idMatch[1]) return false;
      rem = rem.replace(idMatch[0], "");
    }

    const classMatches = [...rem.matchAll(/\.([a-zA-Z0-9_-]+)/g)];
    if (classMatches.length > 0) {
      const classList = this.className.split(/\s+/).filter(Boolean);
      for (const cm of classMatches) {
        if (!classList.includes(cm[1]!)) return false;
      }
      rem = rem.replace(/\.[a-zA-Z0-9_-]+/g, "");
    }

    rem = rem.trim();
    if (rem) {
      if (this.tagName.toLowerCase() !== rem.toLowerCase()) return false;
    }

    return true;
  }

  querySelector<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child as unknown as T;
      const found = child.querySelector<T>(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    const results: T[] = [];
    const visit = (el: TestHTMLElement) => {
      for (const child of el.children) {
        if (child.matches(selector)) {
          results.push(child as unknown as T);
        }
        visit(child);
      }
    };
    visit(this);
    return results;
  }
}

class TestRawHtmlNode {
  public nodeType = 3;
  public parentElement: TestHTMLElement | null = null;
  private rawHtml: string;

  constructor(rawHtml: string) {
    this.rawHtml = rawHtml;
  }

  get textContent(): string {
    return this.rawHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  }

  get outerHTML(): string {
    return this.rawHtml;
  }
}

/**
 * Crea un contenedor HTMLElement ligero a partir de un fragmento HTML o texto.
 */
export function createDomContainer(htmlOrText: string): HTMLElement {
  const container = new TestHTMLElement("div");
  container.innerHTML = htmlOrText;
  return container as unknown as HTMLElement;
}

// ---------------------------------------------------------------------------
// Stateful React Tree Evaluator with Hook Dispatcher
// ---------------------------------------------------------------------------

interface HookSlot {
  type: string;
  value?: any;
  deps?: readonly any[] | null;
  cleanup?: (() => void) | void;
}

interface ComponentInstance {
  hooks: HookSlot[];
}

function depsEqual(a: readonly any[] | null | undefined, b: readonly any[] | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function getReactInternals(): any {
  return (
    (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
    (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  );
}

export type TextMatcher = string | RegExp | ((content: string, element: HTMLElement) => boolean);

function matchesText(el: TestHTMLElement, matcher: TextMatcher): boolean {
  const text = el.textContent.trim();
  const fullText = el.textContent;
  if (typeof matcher === "string") {
    return text === matcher || fullText.includes(matcher);
  }
  if (matcher instanceof RegExp) {
    return matcher.test(fullText);
  }
  return matcher(text, el as unknown as HTMLElement);
}

function getImplicitRole(el: TestHTMLElement): string | null {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  switch (el.tagName) {
    case "BUTTON":
      return "button";
    case "A":
      return el.hasAttribute("href") ? "link" : null;
    case "INPUT": {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (t === "search") return "searchbox";
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      return "textbox";
    }
    case "TEXTAREA":
      return "textbox";
    case "SELECT":
      return "combobox";
    case "DIALOG":
      return "dialog";
    case "UL":
    case "OL":
      return "list";
    case "LI":
      return "listitem";
    case "SECTION":
      return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") ? "region" : null;
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return "heading";
    default:
      return null;
  }
}

export interface BoundQueries {
  getByTestId: (testId: string) => HTMLElement;
  queryByTestId: (testId: string) => HTMLElement | null;
  getAllByTestId: (testId: string) => HTMLElement[];
  queryAllByTestId: (testId: string) => HTMLElement[];
  getByText: (matcher: TextMatcher) => HTMLElement;
  queryByText: (matcher: TextMatcher) => HTMLElement | null;
  getAllByText: (matcher: TextMatcher) => HTMLElement[];
  queryAllByText: (matcher: TextMatcher) => HTMLElement[];
  getByRole: (role: string, options?: { name?: string | RegExp }) => HTMLElement;
  queryByRole: (role: string, options?: { name?: string | RegExp }) => HTMLElement | null;
  getAllByRole: (role: string, options?: { name?: string | RegExp }) => HTMLElement[];
  queryAllByRole: (role: string, options?: { name?: string | RegExp }) => HTMLElement[];
  getByLabelText: (matcher: string | RegExp) => HTMLElement;
  queryByLabelText: (matcher: string | RegExp) => HTMLElement | null;
  getByPlaceholderText: (matcher: string | RegExp) => HTMLElement;
  queryByPlaceholderText: (matcher: string | RegExp) => HTMLElement | null;
}

export function within(rootEl: HTMLElement): BoundQueries {
  const root = rootEl as unknown as TestHTMLElement;

  const queryAllByTestId = (testId: string): HTMLElement[] =>
    root.querySelectorAll(`[data-testid="${testId}"]`);

  const queryByTestId = (testId: string): HTMLElement | null =>
    queryAllByTestId(testId)[0] ?? null;

  const getByTestId = (testId: string): HTMLElement => {
    const el = queryByTestId(testId);
    if (!el) {
      throw new Error(`Unable to find an element by: [data-testid="${testId}"]`);
    }
    return el;
  };

  const getAllByTestId = (testId: string): HTMLElement[] => {
    const els = queryAllByTestId(testId);
    if (els.length === 0) {
      throw new Error(`Unable to find any elements by: [data-testid="${testId}"]`);
    }
    return els;
  };

  const queryAllByText = (matcher: TextMatcher): HTMLElement[] => {
    const all: TestHTMLElement[] = [];
    const visit = (node: TestHTMLElement) => {
      for (const child of node.children) {
        visit(child);
      }
      if (matchesText(node, matcher)) {
        const childAlsoMatches = node.children.some((c) => matchesText(c, matcher));
        if (!childAlsoMatches) {
          all.push(node);
        }
      }
    };
    visit(root);
    return all as unknown as HTMLElement[];
  };

  const queryByText = (matcher: TextMatcher): HTMLElement | null =>
    queryAllByText(matcher)[0] ?? null;

  const getByText = (matcher: TextMatcher): HTMLElement => {
    const el = queryByText(matcher);
    if (!el) {
      throw new Error(`Unable to find an element with the text: ${String(matcher)}`);
    }
    return el;
  };

  const getAllByText = (matcher: TextMatcher): HTMLElement[] => {
    const els = queryAllByText(matcher);
    if (els.length === 0) {
      throw new Error(`Unable to find any elements with the text: ${String(matcher)}`);
    }
    return els;
  };

  const queryAllByRole = (
    role: string,
    options?: { name?: string | RegExp }
  ): HTMLElement[] => {
    const results: TestHTMLElement[] = [];
    const visit = (node: TestHTMLElement) => {
      for (const child of node.children) {
        const r = getImplicitRole(child);
        if (r === role) {
          if (options?.name !== undefined) {
            const accessibleName =
              child.getAttribute("aria-label") ||
              child.getAttribute("title") ||
              child.textContent.trim();
            const matchesName =
              typeof options.name === "string"
                ? accessibleName.includes(options.name)
                : options.name.test(accessibleName);
            if (matchesName) results.push(child);
          } else {
            results.push(child);
          }
        }
        visit(child);
      }
    };
    visit(root);
    return results as unknown as HTMLElement[];
  };

  const queryByRole = (
    role: string,
    options?: { name?: string | RegExp }
  ): HTMLElement | null => queryAllByRole(role, options)[0] ?? null;

  const getByRole = (role: string, options?: { name?: string | RegExp }): HTMLElement => {
    const el = queryByRole(role, options);
    if (!el) {
      throw new Error(
        `Unable to find an accessible element with the role "${role}"${
          options?.name ? ` and name "${String(options.name)}"` : ""
        }`
      );
    }
    return el;
  };

  const getAllByRole = (
    role: string,
    options?: { name?: string | RegExp }
  ): HTMLElement[] => {
    const els = queryAllByRole(role, options);
    if (els.length === 0) {
      throw new Error(`Unable to find any accessible elements with the role "${role}"`);
    }
    return els;
  };

  const queryByLabelText = (matcher: string | RegExp): HTMLElement | null => {
    const results: TestHTMLElement[] = [];
    const matchesLabel = (txt: string) =>
      typeof matcher === "string" ? txt.includes(matcher) : matcher.test(txt);

    const visit = (node: TestHTMLElement) => {
      for (const child of node.children) {
        const ariaLabel = child.getAttribute("aria-label");
        if (ariaLabel && matchesLabel(ariaLabel)) {
          results.push(child);
        }
        if (child.tagName === "LABEL" && matchesLabel(child.textContent)) {
          const forId = child.getAttribute("for");
          if (forId) {
            const target = root.querySelector(`#${forId}`);
            if (target) results.push(target as unknown as TestHTMLElement);
          }
        }
        visit(child);
      }
    };
    visit(root);
    return (results[0] as unknown as HTMLElement) ?? null;
  };

  const getByLabelText = (matcher: string | RegExp): HTMLElement => {
    const el = queryByLabelText(matcher);
    if (!el) {
      throw new Error(`Unable to find a label with the text of: ${String(matcher)}`);
    }
    return el;
  };

  const queryByPlaceholderText = (matcher: string | RegExp): HTMLElement | null => {
    const results: TestHTMLElement[] = [];
    const visit = (node: TestHTMLElement) => {
      for (const child of node.children) {
        const ph = child.getAttribute("placeholder");
        if (ph) {
          const ok = typeof matcher === "string" ? ph.includes(matcher) : matcher.test(ph);
          if (ok) results.push(child);
        }
        visit(child);
      }
    };
    visit(root);
    return (results[0] as unknown as HTMLElement) ?? null;
  };

  const getByPlaceholderText = (matcher: string | RegExp): HTMLElement => {
    const el = queryByPlaceholderText(matcher);
    if (!el) {
      throw new Error(`Unable to find an element with the placeholder text of: ${String(matcher)}`);
    }
    return el;
  };

  return {
    getByTestId,
    queryByTestId,
    getAllByTestId,
    queryAllByTestId,
    getByText,
    queryByText,
    getAllByText,
    queryAllByText,
    getByRole,
    queryByRole,
    getAllByRole,
    queryAllByRole,
    getByLabelText,
    queryByLabelText,
    getByPlaceholderText,
    queryByPlaceholderText,
  };
}

let lastMountedQueries: BoundQueries | null = null;
let activeRefreshFn: (() => void) | null = null;

export interface RenderResult extends BoundQueries {
  container: HTMLElement;
  baseElement: HTMLElement;
  rerender: (nextUi: React.ReactElement) => void;
  unmount: () => void;
  asFragment: () => HTMLElement;
  debug: () => void;
}

export function render(ui: React.ReactElement): RenderResult {
  const container = new TestHTMLElement("div");
  const instances = new Map<string, ComponentInstance>();
  const storeCleanups: Array<() => void> = [];
  let currentUi = ui;
  let isUnmounted = false;
  let idSeed = 0;

  const evaluateTree = () => {
    if (isUnmounted) return;
    const pendingEffects: Array<() => void> = [];
    const internals = getReactInternals();
    const prevDispatcher = internals?.H;

    let currentInstance: ComponentInstance | null = null;
    let currentHookIndex = 0;

    const getSlot = (type: string): HookSlot => {
      if (!currentInstance) {
        throw new Error(`Hook ${type} called outside component render`);
      }
      const idx = currentHookIndex++;
      if (idx >= currentInstance.hooks.length) {
        const slot: HookSlot = { type };
        currentInstance.hooks.push(slot);
        return slot;
      }
      return currentInstance.hooks[idx]!;
    };

    const dispatcher = {
      useState<S>(initialState: S | (() => S)): [S, (action: S | ((prev: S) => S)) => void] {
        const slot = getSlot("useState");
        if (!("initialized" in slot)) {
          slot.value =
            typeof initialState === "function"
              ? (initialState as () => S)()
              : initialState;
          (slot as any).initialized = true;
          (slot as any).setter = (action: S | ((prev: S) => S)) => {
            const next =
              typeof action === "function"
                ? (action as (prev: S) => S)(slot.value)
                : action;
            if (!Object.is(next, slot.value)) {
              slot.value = next;
              evaluateTree();
            }
          };
        }
        return [slot.value, (slot as any).setter];
      },
      useReducer<S, A>(
        reducer: (prevState: S, action: A) => S,
        initialArg: any,
        init?: (arg: any) => S
      ): [S, (action: A) => void] {
        const slot = getSlot("useReducer");
        if (!("initialized" in slot)) {
          slot.value = init ? init(initialArg) : initialArg;
          (slot as any).initialized = true;
          (slot as any).dispatch = (action: A) => {
            const next = reducer(slot.value, action);
            if (!Object.is(next, slot.value)) {
              slot.value = next;
              evaluateTree();
            }
          };
        }
        return [slot.value, (slot as any).dispatch];
      },
      useRef<T>(initialValue: T): { current: T } {
        const slot = getSlot("useRef");
        if (!slot.value) {
          slot.value = { current: initialValue };
        }
        return slot.value;
      },
      useMemo<T>(factory: () => T, deps?: readonly any[] | null): T {
        const slot = getSlot("useMemo");
        if (!("initialized" in slot) || !depsEqual(slot.deps, deps)) {
          slot.value = factory();
          slot.deps = deps;
          (slot as any).initialized = true;
        }
        return slot.value;
      },
      useCallback<T extends (...args: any[]) => any>(cb: T, deps?: readonly any[] | null): T {
        const slot = getSlot("useCallback");
        if (!("initialized" in slot) || !depsEqual(slot.deps, deps)) {
          slot.value = cb;
          slot.deps = deps;
          (slot as any).initialized = true;
        }
        return slot.value;
      },
      useEffect(create: () => (() => void) | void, deps?: readonly any[] | null): void {
        const slot = getSlot("useEffect");
        if (!("initialized" in slot) || !depsEqual(slot.deps, deps)) {
          slot.deps = deps;
          (slot as any).initialized = true;
          pendingEffects.push(() => {
            if (typeof slot.cleanup === "function") {
              try {
                slot.cleanup();
              } catch {}
            }
            slot.cleanup = create();
          });
        }
      },
      useLayoutEffect(create: () => (() => void) | void, deps?: readonly any[] | null): void {
        this.useEffect(create, deps);
      },
      useContext<T>(ctx: React.Context<T>): T {
        return (ctx as any)._currentValue;
      },
      useId(): string {
        const slot = getSlot("useId");
        if (!slot.value) {
          idSeed += 1;
          slot.value = `:r${idSeed}:`;
        }
        return slot.value;
      },
      useSyncExternalStore<T>(
        subscribe: (onStoreChange: () => void) => () => void,
        getSnapshot: () => T
      ): T {
        const slot = getSlot("useSyncExternalStore");
        if (!("subscribed" in slot)) {
          (slot as any).subscribed = true;
          try {
            const unsub = subscribe(() => {
              const next = getSnapshot();
              if (!Object.is(next, slot.value)) {
                slot.value = next;
                evaluateTree();
              }
            });
            if (typeof unsub === "function") {
              storeCleanups.push(unsub);
            }
          } catch {}
        }
        slot.value = getSnapshot();
        return slot.value;
      },
      useTransition(): [boolean, (cb: () => void) => void] {
        return [false, (cb) => cb()];
      },
      useDeferredValue<T>(val: T): T {
        return val;
      },
      useImperativeHandle<T>(ref: any, create: () => T): void {
        if (ref) {
          const val = create();
          if (typeof ref === "function") ref(val);
          else ref.current = val;
        }
      },
      useDebugValue(): void {},
    };

    const runWithComponentFrame = <T,>(pathKey: string, fn: () => T): T => {
      const prevInst = currentInstance;
      const prevIdx = currentHookIndex;
      let inst = instances.get(pathKey);
      if (!inst) {
        inst = { hooks: [] };
        instances.set(pathKey, inst);
      }
      currentInstance = inst;
      currentHookIndex = 0;
      try {
        return fn();
      } finally {
        currentInstance = prevInst;
        currentHookIndex = prevIdx;
      }
    };

    const renderNode = (
      node: any,
      path: string
    ): Array<TestHTMLElement | TestTextNode> => {
      if (node === null || node === undefined || typeof node === "boolean") {
        return [];
      }
      if (typeof node === "string" || typeof node === "number") {
        return [new TestTextNode(String(node))];
      }
      if (Array.isArray(node)) {
        const out: Array<TestHTMLElement | TestTextNode> = [];
        node.forEach((child, idx) => {
          out.push(...renderNode(child, `${path}/${idx}`));
        });
        return out;
      }

      if (typeof node === "object" && "type" in node) {
        const { type, props = {} } = node;
        const keyPart = node.key != null ? String(node.key) : "";

        // Fragment
        if (type === React.Fragment || type === Symbol.for("react.fragment")) {
          return renderNode(props.children, `${path}/frag:${keyPart}`);
        }

        // Function component
        if (typeof type === "function") {
          const compName = type.displayName || type.name || "Component";
          const compPath = `${path}/${compName}:${keyPart}`;
          const rendered = runWithComponentFrame(compPath, () => type(props));
          return renderNode(rendered, compPath);
        }

        // Object types (Context, Provider, Consumer, forwardRef, memo)
        if (typeof type === "object" && type !== null) {
          // React.memo
          if ("type" in type && type.$$typeof === Symbol.for("react.memo")) {
            return renderNode({ ...node, type: type.type }, `${path}/memo:${keyPart}`);
          }

          // React.forwardRef
          if (typeof type.render === "function") {
            const compName = type.displayName || type.render.name || "ForwardRef";
            const compPath = `${path}/${compName}:${keyPart}`;
            const { ref: propRef, ...restProps } = props;
            const rendered = runWithComponentFrame(compPath, () =>
              type.render(restProps, propRef ?? null)
            );
            return renderNode(rendered, compPath);
          }

          // Context Consumer
          if (type.$$typeof === Symbol.for("react.consumer") && "_context" in type) {
            const ctx = type._context;
            const childFn = props.children;
            if (typeof childFn === "function") {
              return renderNode(childFn(ctx._currentValue), `${path}/consumer:${keyPart}`);
            }
            return [];
          }

          // Context / Provider (React 19 uses Context directly or Context.Provider)
          if ("_currentValue" in type || "_context" in type) {
            const ctx = "_context" in type ? type._context : type;
            const prevVal = ctx._currentValue;
            ctx._currentValue = props.value;
            try {
              return renderNode(props.children, `${path}/provider:${keyPart}`);
            } finally {
              ctx._currentValue = prevVal;
            }
          }
        }

        // Host DOM element (div, section, button, input, textarea, etc.)
        if (typeof type === "string") {
          const domEl = new TestHTMLElement(type, props);
          domEl.__refresh = evaluateTree;
          const childNodes = renderNode(props.children, `${path}/${type}:${keyPart}`);
          for (const child of childNodes) {
            domEl.appendChild(child);
          }
          const ref = props.ref;
          if (ref) {
            if (typeof ref === "function") ref(domEl);
            else if (typeof ref === "object") ref.current = domEl;
          }
          return [domEl];
        }
      }

      return [];
    };

    if (internals) {
      internals.H = dispatcher;
    }
    try {
      const rootNodes = renderNode(currentUi, "root");
      container.childNodes = [];
      for (const n of rootNodes) {
        container.appendChild(n);
      }
    } finally {
      if (internals) {
        internals.H = prevDispatcher;
      }
    }

    // Run queued useEffects
    while (pendingEffects.length > 0) {
      const effectFn = pendingEffects.shift()!;
      try {
        effectFn();
      } catch {}
    }
  };

  activeRefreshFn = evaluateTree;
  evaluateTree();

  const domContainer = container as unknown as HTMLElement;
  const bound = within(domContainer);
  lastMountedQueries = bound;

  return {
    container: domContainer,
    baseElement: domContainer,
    rerender: (nextUi: React.ReactElement) => {
      currentUi = nextUi;
      evaluateTree();
    },
    unmount: () => {
      isUnmounted = true;
      for (const unsub of storeCleanups) {
        try {
          unsub();
        } catch {}
      }
      for (const inst of instances.values()) {
        for (const h of inst.hooks) {
          if (typeof h.cleanup === "function") {
            try {
              h.cleanup();
            } catch {}
          }
        }
      }
      container.childNodes = [];
    },
    asFragment: () => domContainer,
    debug: () => {
      console.log(domContainer.innerHTML);
    },
    ...bound,
  };
}

export const screen: BoundQueries = {
  getByTestId: (id) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getByTestId(id);
  },
  queryByTestId: (id) => lastMountedQueries?.queryByTestId(id) ?? null,
  getAllByTestId: (id) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getAllByTestId(id);
  },
  queryAllByTestId: (id) => lastMountedQueries?.queryAllByTestId(id) ?? [],
  getByText: (m) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getByText(m);
  },
  queryByText: (m) => lastMountedQueries?.queryByText(m) ?? null,
  getAllByText: (m) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getAllByText(m);
  },
  queryAllByText: (m) => lastMountedQueries?.queryAllByText(m) ?? [],
  getByRole: (r, o) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getByRole(r, o);
  },
  queryByRole: (r, o) => lastMountedQueries?.queryByRole(r, o) ?? null,
  getAllByRole: (r, o) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getAllByRole(r, o);
  },
  queryAllByRole: (r, o) => lastMountedQueries?.queryAllByRole(r, o) ?? [],
  getByLabelText: (m) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getByLabelText(m);
  },
  queryByLabelText: (m) => lastMountedQueries?.queryByLabelText(m) ?? null,
  getByPlaceholderText: (m) => {
    if (!lastMountedQueries) throw new Error("No component rendered yet");
    return lastMountedQueries.getByPlaceholderText(m);
  },
  queryByPlaceholderText: (m) => lastMountedQueries?.queryByPlaceholderText(m) ?? null,
};

export const fireEvent = {
  click(element: HTMLElement, init?: Record<string, any>): any {
    const el = element as unknown as TestHTMLElement;
    if (el.disabled) return;
    const handler = el.__reactProps?.onClick;
    if (typeof handler === "function") {
      const res = handler({
        target: el,
        currentTarget: el,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...init,
      });
      (el.__refresh ?? activeRefreshFn)?.();
      return res;
    }
  },
  change(element: HTMLElement, eventInit: { target: { value: string; [k: string]: any } }): any {
    const el = element as unknown as TestHTMLElement;
    const nextValue =
      eventInit?.target?.value !== undefined
        ? String(eventInit.target.value)
        : el.value;
    el.value = nextValue;
    const handler = el.__reactProps?.onChange;
    if (typeof handler === "function") {
      const res = handler({
        target: { ...el, ...eventInit.target, value: nextValue },
        currentTarget: el,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      (el.__refresh ?? activeRefreshFn)?.();
      return res;
    }
  },
  blur(element: HTMLElement, init?: Record<string, any>): any {
    const el = element as unknown as TestHTMLElement;
    const handler = el.__reactProps?.onBlur;
    if (typeof handler === "function") {
      const res = handler({
        target: el,
        currentTarget: el,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...init,
      });
      (el.__refresh ?? activeRefreshFn)?.();
      return res;
    }
  },
  focus(element: HTMLElement, init?: Record<string, any>): any {
    const el = element as unknown as TestHTMLElement;
    const handler = el.__reactProps?.onFocus;
    if (typeof handler === "function") {
      const res = handler({
        target: el,
        currentTarget: el,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...init,
      });
      (el.__refresh ?? activeRefreshFn)?.();
      return res;
    }
  },
  keyDown(element: HTMLElement, init?: { key?: string; code?: string; [k: string]: any }): any {
    const el = element as unknown as TestHTMLElement;
    const handler = el.__reactProps?.onKeyDown;
    if (typeof handler === "function") {
      const res = handler({
        target: el,
        currentTarget: el,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...init,
      });
      (el.__refresh ?? activeRefreshFn)?.();
      return res;
    }
  },
};
