import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, FileUp,
  LayoutDashboard, Plus, Search, Settings2, Pencil, Trash2,
  Copy, Check, X, BriefcaseBusiness, CircleCheck, Database,
  FileSpreadsheet, CalendarRange, ClipboardCopy, Sparkles, RefreshCw,
  StickyNote, PanelLeftClose, PanelLeftOpen, Sun, Moon,
  ArrowUp, ArrowDown, GripVertical, ArrowRightCircle, ListPlus, List,
  Cloud, CloudUpload, Lock, Unlock, CheckSquare, Square,
  MoreHorizontal, ChevronDown, Columns, Layers, RotateCcw
} from 'lucide-react';

export type WorkOutcome =
  | ''
  | 'A Completed'
  | 'B In Progress'
  | 'C Pending, awaiting action'
  | 'D Issues reported, I will fix'
  | 'E On Hold- intentionally paused.'
  | 'F Blocked, cannot proceed';

export type TaskCategory =
  | "A Today's Work"
  | "B Tomorrow's Plan"
  | 'C Leave';

export type WorkType =
  | ''
  | 'Bug Fixing'
  | 'Development'
  | 'Investigation'
  | 'Meeting / Discussion'
  | 'Testing'
  | 'Training';

export type WorkEntry = {
  id: string;
  date: string;
  taskCategory: TaskCategory;
  module: string;
  activity: string;
  workDone: WorkOutcome;      // Column 6 in Sheet (DDL)
  hours: number;              // Column 7 in Sheet
  type: WorkType;             // Column 8 in Sheet (DDL)
  reference: string;          // Column 9 in Sheet (Ticket / Reference)
  appRemarks: string;         // Used only in the app (not copied to sheet)
  isLocked?: boolean;         // Prevents accidental edits or deletes
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = 'my-work-log.entries.v3';
const MODULES_KEY = 'my-work-log.modules.v3';
const DATE_FORMAT_KEY = 'my-work-log.date-format.v1';
const SIDEBAR_COLLAPSED_KEY = 'my-work-log.sidebar-collapsed.v1';
const THEME_KEY = 'my-work-log.theme.v1';
const NEXT_ROW_NO_KEY = 'my-work-log.next-sheet-row-no.v1';
const CLOUD_SYNC_URL_KEY = 'my-work-log.cloud-sync-url.v1';
const CLOUD_LAST_SYNC_KEY = 'my-work-log.cloud-last-sync.v1';
const LEGACY_STORAGE_V2 = 'my-work-log.entries.v2';
const LEGACY_STORAGE_V1 = 'my-work-log.entries.v1';
const LEGACY_MODULES_V2 = 'my-work-log.modules.v2';
const LEGACY_MODULES_V1 = 'my-work-log.modules.v1';
const DENSITY_KEY = 'my-work-log.table-density.v1';
const GROUP_BY_CATEGORY_KEY = 'my-work-log.group-by-category.v1';
const VISIBLE_COLUMNS_KEY = 'my-work-log.visible-columns.v1';

export type TableDensity = 'compact' | 'normal' | 'relaxed';

export type VisibleColumns = {
  order: boolean;
  rowNo: boolean;
  task: boolean;
  module: boolean;
  outcome: boolean;
  hours: boolean;
  type: boolean;
  reference: boolean;
  remarks: boolean;
};

export const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  order: true,
  rowNo: true,
  task: true,
  module: true,
  outcome: true,
  hours: true,
  type: true,
  reference: true,
  remarks: true,
};

export const outcomeMeta: Record<WorkOutcome, { label: string; shortLabel: string; dotClass: string; icon: string }> = {
  'A Completed': { label: 'A Completed', shortLabel: 'Completed', dotClass: 'dot-a', icon: '●' },
  'B In Progress': { label: 'B In Progress', shortLabel: 'In Progress', dotClass: 'dot-b', icon: '◐' },
  'C Pending, awaiting action': { label: 'C Pending, awaiting action', shortLabel: 'Pending', dotClass: 'dot-c', icon: '◌' },
  'D Issues reported, I will fix': { label: 'D Issues reported, I will fix', shortLabel: 'Issues reported', dotClass: 'dot-d', icon: '▲' },
  'E On Hold- intentionally paused.': { label: 'E On Hold- intentionally paused.', shortLabel: 'On Hold', dotClass: 'dot-e', icon: '⏸' },
  'F Blocked, cannot proceed': { label: 'F Blocked, cannot proceed', shortLabel: 'Blocked', dotClass: 'dot-f', icon: '⛔' },
  '': { label: '(Blank / None)', shortLabel: 'Set Outcome', dotClass: 'dot-empty', icon: '○' },
};

export const companyModules: string[] = [
  'Administration',
  'General Ledger',
  'Fixed Assets',
  'HR/Payroll',
  'Inventory',
  'Shipping',
  'Training Management',
  'Vendor & Account Payable',
  'CRM+Lead Mgmt',
];

export const outcomeOptions: WorkOutcome[] = [
  'A Completed',
  'B In Progress',
  'C Pending, awaiting action',
  'D Issues reported, I will fix',
  'E On Hold- intentionally paused.',
  'F Blocked, cannot proceed',
];

export const taskCategories: TaskCategory[] = [
  "A Today's Work",
  "B Tomorrow's Plan",
  "C Leave",
];

export const workTypes: WorkType[] = [
  'Bug Fixing',
  'Development',
  'Investigation',
  'Meeting / Discussion',
  'Testing',
  'Training',
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatSheetDate = (iso: string) => {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = months[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
};

const prettyDate = (iso: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) => {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, options);
};

const monthKey = (iso: string) => (iso && typeof iso === 'string' ? iso.slice(0, 7) : todayISO().slice(0, 7));

const monthLabel = (iso: string) => {
  const key = monthKey(iso);
  const d = new Date(`${key}-15T12:00:00`);
  return isNaN(d.getTime()) ? key : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const durationLabel = (hours: number | string) => {
  const num = Number.isFinite(Number(hours)) ? Math.max(0, Number(hours)) : 0;
  const minutes = Math.round(num * 60);
  if (!minutes) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m} min`;
};

const fmtHours = (n: number | string) => {
  const val = Number(n);
  return Number.isFinite(val) ? val.toFixed(2) : '0.00';
};

const normalizeEntry = (raw: any): WorkEntry => {
  const item = raw && typeof raw === 'object' ? raw : {};

  let workDone: WorkOutcome = 'B In Progress';
  if (outcomeOptions.includes(item.workDone)) {
    workDone = item.workDone;
  } else if (outcomeOptions.includes(item.status)) {
    workDone = item.status;
  } else if (item.status === 'Done' || item.workDone === 'Done') {
    workDone = 'A Completed';
  } else if (item.status === 'In Progress' || item.workDone === 'In Progress') {
    workDone = 'B In Progress';
  } else if (item.status === 'Pending' || item.workDone === 'Pending') {
    workDone = 'C Pending, awaiting action';
  } else if (item.workDone === '' || item.workDone === null || item.status === '') {
    workDone = '';
  }

  let taskCategory: TaskCategory = "A Today's Work";
  if (taskCategories.includes(item.taskCategory)) {
    taskCategory = item.taskCategory;
  } else if (taskCategories.includes(item.task)) {
    taskCategory = item.task;
  }

  let type: WorkType = '';
  if (workTypes.includes(item.type)) {
    type = item.type;
  }

  const activity = String(
    item.activity ||
    (taskCategories.includes(item.task) ? '' : (item.task || '')) ||
    ''
  ).trim();

  // If previous versions stored a text description in workDone, preserve it into appRemarks!
  const legacyDescription =
    typeof item.workDone === 'string' && !outcomeOptions.includes(item.workDone as any)
      ? item.workDone
      : (item.description || '');

  const appRemarks = String(item.appRemarks || legacyDescription || '').trim();
  const reference = String(item.reference || '').trim();
  const rawHours = Number(item.hours);
  const hours = Number.isFinite(rawHours) && rawHours >= 0 ? Math.min(24, rawHours) : 0;
  const moduleName = typeof item.module === 'string' ? item.module.trim() : '';
  const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : todayISO();
  const id = typeof item.id === 'string' && item.id ? item.id : makeId();
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString();
  const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString();

  return {
    id,
    date,
    taskCategory,
    module: moduleName,
    activity: activity || 'Untitled task',
    workDone,
    hours,
    type,
    reference,
    appRemarks,
    isLocked: Boolean(item.isLocked),
    createdAt,
    updatedAt,
  };
};

const loadEntries = (): WorkEntry[] => {
  try {
    const rawData =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_V2) ||
      localStorage.getItem(LEGACY_STORAGE_V1) ||
      '[]';
    const parsed = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeEntry);
    }
    return [];
  } catch {
    return [];
  }
};

const loadModules = (): string[] => {
  try {
    const raw =
      localStorage.getItem(MODULES_KEY) ||
      localStorage.getItem(LEGACY_MODULES_V2) ||
      localStorage.getItem(LEGACY_MODULES_V1);
    if (!raw) return companyModules;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed
        .filter((x: unknown) => typeof x === 'string')
        .map(x => (x as string).trim())
        .filter(Boolean);
      if (valid.length > 0) {
        return Array.from(new Set([...companyModules, ...valid]));
      }
    }
    return companyModules;
  } catch {
    return companyModules;
  }
};

const escapeTSVCell = (value: string | number) => {
  let str = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[\t\n"]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const escapeCSVCell = (value: string | number) => {
  let str = String(value ?? '');
  if (/^[=+@-|\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

const escapeHTML = (str: string) => {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r\n/g, '<br/>')
    .replace(/[\r\n]/g, '<br/>');
};

const formatEntriesForSheet = (
  entriesList: WorkEntry[],
  includeHeaders = false,
  dateFormat: 'DD-MMM-YY' | 'YYYY-MM-DD' = 'DD-MMM-YY',
  startRowNo = 1
) => {
  const headerLabels = [
    'No.',
    'Date',
    'Task',
    'Module / Area',
    'Activity',
    'Work Done / Outcome',
    'Time Spent (hrs)',
    'Type',
    'Ticket / Reference / Remarks',
  ];

  const baseNo = Number.isFinite(startRowNo) && startRowNo >= 1 ? Math.floor(startRowNo) : 1;

  const dataRows = entriesList.map((entry, index) => {
    const formattedDate = dateFormat === 'DD-MMM-YY' ? formatSheetDate(entry.date) : entry.date;
    const hoursFormatted = entry.hours && Number(entry.hours) > 0 ? Number(entry.hours).toFixed(2) : '';
    const typeFormatted = entry.type || '';
    const workDoneFormatted = entry.workDone || '';

    return [
      baseNo + index,
      formattedDate,
      entry.taskCategory || "A Today's Work",
      entry.module || '',
      entry.activity || '',
      workDoneFormatted,
      hoursFormatted,
      typeFormatted,
      entry.reference || '',
    ];
  });

  const allRows = includeHeaders ? [headerLabels, ...dataRows] : dataRows;

  const tsvText = allRows
    .map(row => row.map(escapeTSVCell).join('\t'))
    .join('\r\n');

  const htmlRows = allRows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHTML(String(cell))}</td>`).join('')}</tr>`)
    .join('');
  const htmlTable = `<table><tbody>${htmlRows}</tbody></table>`;

  return { tsvText, htmlTable };
};

const copyToClipboard = async (tsvText: string, htmlTable?: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.ClipboardItem && htmlTable) {
    try {
      const textBlob = new Blob([tsvText], { type: 'text/plain' });
      const htmlBlob = new Blob([htmlTable], { type: 'text/html' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': textBlob,
          'text/html': htmlBlob,
        }),
      ]);
      return true;
    } catch {
      // Permission restriction with ClipboardItem; fall through
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(tsvText);
      return true;
    } catch {
      // Permission restriction; fall through
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = tsvText;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    return success;
  } catch {
    return false;
  }
};

const getOutcomeClass = (outcome: WorkOutcome) => {
  if (outcome.startsWith('A')) return 'status-a';
  if (outcome.startsWith('B')) return 'status-b';
  if (outcome.startsWith('C')) return 'status-c';
  if (outcome.startsWith('D')) return 'status-d';
  if (outcome.startsWith('E')) return 'status-e';
  if (outcome.startsWith('F')) return 'status-f';
  return 'status-empty';
};

const getTaskCategoryClass = (cat: TaskCategory) => {
  if (cat.startsWith('A')) return 'task-cat-a';
  if (cat.startsWith('B')) return 'task-cat-b';
  if (cat.startsWith('C')) return 'task-cat-c';
  return 'task-cat-a';
};

const getTypeClass = (type: WorkType) => {
  switch (type) {
    case 'Bug Fixing': return 'type-bug';
    case 'Development': return 'type-dev';
    case 'Investigation': return 'type-investigation';
    case 'Meeting / Discussion': return 'type-meeting';
    case 'Testing': return 'type-testing';
    case 'Training': return 'type-training';
    default: return 'type-empty';
  }
};

const getModuleClass = (moduleName: string) => {
  switch (moduleName) {
    case 'Administration': return 'module-admin';
    case 'General Ledger': return 'module-gl';
    case 'Fixed Assets': return 'module-fixed-assets';
    case 'HR/Payroll': return 'module-hr';
    case 'Inventory': return 'module-inventory';
    case 'Shipping': return 'module-shipping';
    case 'Training Management': return 'module-training';
    case 'Vendor & Account Payable': return 'module-vendor-ap';
    case 'CRM+Lead Mgmt': return 'module-crm';
    case '': return 'module-empty';
    default: return 'module-custom';
  }
};

type EntryFormData = {
  date: string;
  taskCategory: TaskCategory;
  module: string;
  activity: string;
  workDone: WorkOutcome;
  hours: number | string;
  type: WorkType;
  reference: string;
  appRemarks: string;
};

function App() {
  const [entries, setEntries] = useState<WorkEntry[]>(loadEntries);
  const [modules, setModules] = useState<string[]>(loadModules);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [view, setView] = useState<'day' | 'month'>('day');
  const [query, setQuery] = useState('');
  const [taskFilter, setTaskFilter] = useState('All tasks');
  const [outcomeFilter, setOutcomeFilter] = useState('All outcomes');
  const [moduleFilter, setModuleFilter] = useState('All modules');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkEntry | null>(null);
  const [notice, setNotice] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [includeHeadersInCopy, setIncludeHeadersInCopy] = useState(false);
  const [sheetDateFormat, setSheetDateFormat] = useState<'DD-MMM-YY' | 'YYYY-MM-DD'>(() => {
    return (localStorage.getItem(DATE_FORMAT_KEY) as any) || 'DD-MMM-YY';
  });
  const [startRowNo, setStartRowNo] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(NEXT_ROW_NO_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= 1) return parsed;
      }
    } catch {
      // storage handled
    }
    return 1;
  });
  const [cloudSyncUrl, setCloudSyncUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(CLOUD_SYNC_URL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(() => {
    try {
      return localStorage.getItem(CLOUD_LAST_SYNC_KEY) || '';
    } catch {
      return '';
    }
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(new Set());

  const toggleActivityExpand = (id: string) => {
    setExpandedActivityIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [inlineEditingCell, setInlineEditingCell] = useState<{ id: string; field: 'hours' | 'reference' | 'activity'; value: string } | null>(null);

  const [tableDensity, setTableDensity] = useState<TableDensity>(() => {
    try {
      const saved = localStorage.getItem(DENSITY_KEY) as TableDensity;
      if (saved === 'compact' || saved === 'normal' || saved === 'relaxed') return saved;
      return 'normal';
    } catch {
      return 'normal';
    }
  });

  const [groupByCategory, setGroupByCategory] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GROUP_BY_CATEGORY_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
    try {
      const saved = localStorage.getItem(VISIBLE_COLUMNS_KEY);
      if (saved) return { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(saved) };
      return DEFAULT_VISIBLE_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  const [recentlyCopiedRowId, setRecentlyCopiedRowId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null);
  const [activeOutcomeMenuId, setActiveOutcomeMenuId] = useState<string | null>(null);
  const [activeMoreMenuId, setActiveMoreMenuId] = useState<string | null>(null);
  const [showColumnsMenu, setShowColumnsMenu] = useState<boolean>(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleSelectRow = (id: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = (allIds: string[]) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      const allSelected = allIds.length > 0 && allIds.every(id => next.has(id));
      if (allSelected) {
        allIds.forEach(id => next.delete(id));
      } else {
        allIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleLockRow = (entry: WorkEntry) => {
    const nextLocked = !entry.isLocked;
    setEntries(old =>
      old.map(e => (e.id === entry.id ? { ...e, isLocked: nextLocked, updatedAt: new Date().toISOString() } : e))
    );
    setNotice(nextLocked ? `Locked row against edits & deletes.` : `Unlocked row.`);
  };

  const isCancellingInlineRef = useRef(false);

  const cancelInlineEdit = () => {
    isCancellingInlineRef.current = true;
    setInlineEditingCell(null);
  };

  const saveInlineEdit = (id: string, field: 'hours' | 'reference' | 'activity', value: string) => {
    if (isCancellingInlineRef.current) {
      isCancellingInlineRef.current = false;
      return;
    }
    const target = entries.find(e => e.id === id);
    if (target?.isLocked) {
      setNotice('Cannot edit a locked row.');
      setInlineEditingCell(null);
      return;
    }
    setEntries(old =>
      old.map(e => {
        if (e.id !== id) return e;
        if (field === 'hours') {
          const num = value === '' ? 0 : Number(value);
          const safeNum = Number.isFinite(num) && num >= 0 ? Math.round(Math.min(24, num) * 100) / 100 : e.hours;
          return { ...e, hours: safeNum, updatedAt: new Date().toISOString() };
        }
        if (field === 'reference') {
          return { ...e, reference: value.trim(), updatedAt: new Date().toISOString() };
        }
        if (field === 'activity') {
          const trimmed = value.trim();
          return { ...e, activity: trimmed || e.activity, updatedAt: new Date().toISOString() };
        }
        return e;
      })
    );
    setInlineEditingCell(null);
    setNotice('Updated.');
  };

  const [moduleDraft, setModuleDraft] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // storage handled
      }
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // storage handled
      }
      return next;
    });
  };

  const [form, setForm] = useState<EntryFormData>({
    date: todayISO(),
    taskCategory: "A Today's Work",
    module: companyModules[0],
    activity: '',
    workDone: 'B In Progress',
    hours: '',
    type: '',
    reference: '',
    appRemarks: '',
  });
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineEditingCell) {
          cancelInlineEdit();
        } else if (activeOutcomeMenuId) {
          setActiveOutcomeMenuId(null);
        } else if (activeMoreMenuId) {
          setActiveMoreMenuId(null);
        } else if (showColumnsMenu) {
          setShowColumnsMenu(false);
        } else if (showForm) {
          setShowForm(false);
          setEditing(null);
        } else if (showSettings) {
          setShowSettings(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForm, showSettings, inlineEditingCell, activeOutcomeMenuId, activeMoreMenuId, showColumnsMenu]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage quota or restriction handled
    }
  }, [entries]);

  useEffect(() => {
    try {
      localStorage.setItem(MODULES_KEY, JSON.stringify(modules));
    } catch {
      // Storage exception handler
    }
  }, [modules]);

  useEffect(() => {
    try {
      localStorage.setItem(DATE_FORMAT_KEY, sheetDateFormat);
    } catch {
      // Storage exception handler
    }
  }, [sheetDateFormat]);

  useEffect(() => {
    try {
      localStorage.setItem(NEXT_ROW_NO_KEY, String(startRowNo));
    } catch {
      // Storage exception handler
    }
  }, [startRowNo]);

  useEffect(() => {
    try {
      if (cloudSyncUrl) {
        localStorage.setItem(CLOUD_SYNC_URL_KEY, cloudSyncUrl.trim());
      } else {
        localStorage.removeItem(CLOUD_SYNC_URL_KEY);
      }
    } catch {
      // Storage exception handler
    }
  }, [cloudSyncUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, tableDensity);
    } catch {
      // Storage exception handler
    }
  }, [tableDensity]);

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_BY_CATEGORY_KEY, String(groupByCategory));
    } catch {
      // Storage exception handler
    }
  }, [groupByCategory]);

  useEffect(() => {
    try {
      localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {
      // Storage exception handler
    }
  }, [visibleColumns]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.outcome-popover-container')) {
        setActiveOutcomeMenuId(null);
      }
      if (!target.closest('.more-menu-container')) {
        setActiveMoreMenuId(null);
      }
      if (!target.closest('.columns-menu-container')) {
        setShowColumnsMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const monthEntries = useMemo(
    () => entries.filter(e => monthKey(e.date) === monthKey(selectedDate)),
    [entries, selectedDate]
  );

  const visibleEntries = useMemo(() => {
    const source = view === 'day' ? entries.filter(e => e.date === selectedDate) : monthEntries;
    const q = query.trim().toLowerCase();
    return source.filter(e => {
      const matchesQuery =
        !q ||
        [
          String(e.reference || ''),
          String(e.activity || ''),
          String(e.workDone || ''),
          String(e.module || ''),
          String(e.type || ''),
          String(e.taskCategory || ''),
          String(e.appRemarks || ''),
        ].some(v => v.toLowerCase().includes(q));

      const matchesTask = taskFilter === 'All tasks' || e.taskCategory === taskFilter;
      const matchesOutcome = outcomeFilter === 'All outcomes' || e.workDone === outcomeFilter;
      const matchesModule =
        moduleFilter === 'All modules' ||
        (moduleFilter === '(Blank)' ? !e.module : e.module === moduleFilter);
      const matchesType = typeFilter === 'All types' || e.type === typeFilter;
      return matchesQuery && matchesTask && matchesOutcome && matchesModule && matchesType;
    });
  }, [entries, selectedDate, view, monthEntries, query, taskFilter, outcomeFilter, moduleFilter, typeFilter]);

  const dayEntries = entries.filter(e => e.date === selectedDate);
  const totalHours = dayEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  const doneCount = dayEntries.filter(e => e.workDone === 'A Completed').length;
  const inProgressCount = dayEntries.filter(e => e.workDone === 'B In Progress').length;
  const monthHours = monthEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  const monthDays = new Set(monthEntries.map(e => e.date)).size;

  const visibleTotalHours = visibleEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  const visibleCompletedCount = visibleEntries.filter(e => e.workDone === 'A Completed').length;
  const visibleInProgressCount = visibleEntries.filter(e => e.workDone === 'B In Progress').length;
  const entryIndexMap = useMemo(() => new Map(visibleEntries.map((e, idx) => [e.id, idx])), [visibleEntries]);

  const activeColumnCount =
    1 // select-col
    + (visibleColumns.order ? 1 : 0)
    + (visibleColumns.rowNo ? 1 : 0)
    + (visibleColumns.task ? 1 : 0)
    + (visibleColumns.module ? 1 : 0)
    + 1 // activity (always visible)
    + (visibleColumns.outcome ? 1 : 0)
    + (visibleColumns.hours ? 1 : 0)
    + (visibleColumns.type ? 1 : 0)
    + (visibleColumns.reference ? 1 : 0)
    + (visibleColumns.remarks ? 1 : 0)
    + 1; // actions (always visible)

  const groupedEntries = useMemo(() => {
    if (!groupByCategory) {
      return [{ category: 'all', title: 'All Entries', entries: visibleEntries }];
    }
    const groups: { category: TaskCategory | string; title: string; entries: WorkEntry[] }[] = [];
    const standardCategories: TaskCategory[] = ["A Today's Work", "B Tomorrow's Plan", "C Leave"];

    standardCategories.forEach(cat => {
      const items = visibleEntries.filter(e => e.taskCategory === cat);
      if (items.length > 0) {
        groups.push({ category: cat, title: cat, entries: items });
      }
    });

    const otherItems = visibleEntries.filter(e => !standardCategories.includes(e.taskCategory));
    if (otherItems.length > 0) {
      groups.push({ category: 'Other', title: 'Other Categories', entries: otherItems });
    }

    return groups;
  }, [visibleEntries, groupByCategory]);

  const resetAllFilters = () => {
    setQuery('');
    setTaskFilter('All tasks');
    setModuleFilter('All modules');
    setOutcomeFilter('All outcomes');
    setTypeFilter('All types');
  };

  const hasActiveFilters = Boolean(
    query ||
    taskFilter !== 'All tasks' ||
    moduleFilter !== 'All modules' ||
    outcomeFilter !== 'All outcomes' ||
    typeFilter !== 'All types'
  );

  const changeDate = useCallback((amount: number) => {
    if (view === 'month') {
      const parts = selectedDate.split('-');
      const y = parseInt(parts[0], 10) || new Date().getFullYear();
      const m = (parseInt(parts[1], 10) || 1) - 1;
      const target = new Date(y, m + amount, 1);
      setSelectedDate(
        `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-01`
      );
    } else {
      const d = new Date(`${selectedDate.slice(0, 10)}T12:00:00`);
      if (isNaN(d.getTime())) {
        setSelectedDate(todayISO());
        return;
      }
      d.setDate(d.getDate() + amount);
      setSelectedDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
    }
  }, [view, selectedDate]);

  const openNew = () => {
    setEditing(null);
    setForm({
      date: selectedDate,
      taskCategory: "A Today's Work",
      module: modules[0] || companyModules[0],
      activity: '',
      workDone: 'B In Progress',
      hours: '',
      type: '',
      reference: '',
      appRemarks: '',
    });
    setShowForm(true);
  };

  const openEdit = (entry: WorkEntry) => {
    if (entry.isLocked) {
      setNotice('This row is locked to prevent edits. Click the lock icon on the row to unlock it first.');
      return;
    }
    setEditing(entry);
    setForm({
      date: entry.date,
      taskCategory: entry.taskCategory,
      module: entry.module !== undefined ? entry.module : (modules[0] || companyModules[0]),
      activity: entry.activity,
      workDone: entry.workDone,
      hours: entry.hours === 0 ? '' : entry.hours,
      type: entry.type || '',
      reference: entry.reference || '',
      appRemarks: entry.appRemarks || '',
    });
    setShowForm(true);
  };

  // Recent unique ticket references with their last used module, type, activity
  const recentTickets = useMemo(() => {
    const map = new Map<string, { reference: string; module: string; type: WorkType; activity: string }>();
    for (const e of entries) {
      const ref = (e.reference || '').trim();
      if (ref && !map.has(ref.toLowerCase())) {
        map.set(ref.toLowerCase(), {
          reference: ref,
          module: e.module || '',
          type: e.type || '',
          activity: e.activity || '',
        });
      }
    }
    return Array.from(map.values()).slice(0, 30);
  }, [entries]);

  // Handle auto-filling fields when ticket reference is selected or typed
  const handleReferenceChange = (newRef: string) => {
    const match = recentTickets.find(t => t.reference.toLowerCase() === newRef.trim().toLowerCase());
    if (match) {
      setForm(prev => ({
        ...prev,
        reference: newRef,
        module: prev.module && prev.module !== (modules[0] || companyModules[0]) ? prev.module : (match.module || prev.module),
        type: prev.type ? prev.type : (match.type || prev.type),
      }));
    } else {
      setForm(prev => ({ ...prev, reference: newRef }));
    }
  };

  const applyTicketSuggestion = (t: { reference: string; module: string; type: WorkType; activity: string }) => {
    setForm(prev => ({
      ...prev,
      reference: t.reference,
      module: t.module !== undefined ? t.module : prev.module,
      type: t.type || prev.type,
      activity: prev.activity.trim() ? prev.activity : t.activity,
    }));
    setNotice(`Auto-filled from ${t.reference} (Module: ${t.module || 'None'}, Type: ${t.type || 'None'})`);
  };

  const activityTextareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleBullets = () => {
    const textarea = activityTextareaRef.current;
    const text = form.activity;

    // If textarea is available and has a selection, bullet the selected lines
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start !== end) {
        // Multi-line selection bullet toggle
        const before = text.substring(0, start);
        const selected = text.substring(start, end);
        const after = text.substring(end);

        const lines = selected.split('\n');
        const allBulleted = lines.every(line => line.trim().startsWith('• '));
        const transformedLines = lines.map(line => {
          if (allBulleted) {
            return line.replace(/^\s*•\s*/, '');
          }
          return line.trim() ? (line.startsWith('• ') ? line : `• ${line}`) : line;
        });

        const newSelected = transformedLines.join('\n');
        setForm(prev => ({ ...prev, activity: before + newSelected + after }));
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start, start + newSelected.length);
        }, 0);
        return;
      }
    }

    // Default action: if empty or cursor at end, add bullet
    if (!text.trim()) {
      setForm(prev => ({ ...prev, activity: '• ' }));
      setTimeout(() => {
        if (activityTextareaRef.current) {
          activityTextareaRef.current.focus();
          activityTextareaRef.current.setSelectionRange(2, 2);
        }
      }, 0);
      return;
    }

    const lines = text.split('\n');
    const allBulleted = lines.every(line => !line.trim() || line.trim().startsWith('• '));

    if (allBulleted) {
      // Remove bullets
      const unbulleted = lines.map(l => l.replace(/^\s*•\s*/, '')).join('\n');
      setForm(prev => ({ ...prev, activity: unbulleted }));
    } else {
      // Add bullets to non-empty lines
      const bulleted = lines
        .map(l => (l.trim() ? (l.startsWith('• ') ? l : `• ${l}`) : l))
        .join('\n');
      setForm(prev => ({ ...prev, activity: bulleted }));
    }

    setTimeout(() => {
      activityTextareaRef.current?.focus();
    }, 0);
  };

  const handleActivityKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When Enter is pressed on a line starting with a bullet, automatically continue the bullet on the next line
    if (e.key === 'Enter') {
      const textarea = e.currentTarget;
      const pos = textarea.selectionStart;
      const text = textarea.value;

      // Find current line
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
      const currentLine = text.substring(lineStart, pos);

      if (currentLine.trim() === '•') {
        // User pressed Enter on an empty bullet line -> terminate bullet list
        e.preventDefault();
        const newText = text.substring(0, lineStart) + text.substring(pos);
        setForm(prev => ({ ...prev, activity: newText }));
        setTimeout(() => {
          textarea.setSelectionRange(lineStart, lineStart);
        }, 0);
      } else if (currentLine.startsWith('• ')) {
        // Insert a new bullet line
        e.preventDefault();
        const insertion = '\n• ';
        const newText = text.substring(0, pos) + insertion + text.substring(pos);
        setForm(prev => ({ ...prev, activity: newText }));
        setTimeout(() => {
          const newPos = pos + insertion.length;
          textarea.setSelectionRange(newPos, newPos);
        }, 0);
      }
    }
  };

  const saveEntry = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanActivity = form.activity.trim();
    if (!cleanActivity) {
      setNotice('Please enter an activity description.');
      return;
    }

    const rawHours = form.hours === '' ? 0 : Number(form.hours);
    if (!Number.isFinite(rawHours) || rawHours < 0 || rawHours > 24) {
      setNotice('Hours must be between 0 and 24.');
      return;
    }

    const now = new Date().toISOString();
    const finalModule = form.module ? form.module.trim() : '';

    if (editing) {
      setEntries(old =>
        old.map(e =>
          e.id === editing.id
            ? {
                ...e,
                date: form.date,
                taskCategory: form.taskCategory,
                module: finalModule,
                activity: cleanActivity,
                reference: form.reference.trim(),
                workDone: form.workDone,
                type: form.type,
                appRemarks: form.appRemarks.trim(),
                hours: rawHours,
                updatedAt: now,
              }
            : e
        )
      );
      setNotice('Work entry updated.');
    } else {
      setEntries(old => [
        ...old,
        {
          id: makeId(),
          date: form.date,
          taskCategory: form.taskCategory,
          module: finalModule,
          activity: cleanActivity,
          reference: form.reference.trim(),
          workDone: form.workDone,
          hours: rawHours,
          type: form.type,
          appRemarks: form.appRemarks.trim(),
          createdAt: now,
          updatedAt: now,
        },
      ]);
      setNotice('Work entry saved.');
    }

    setSelectedDate(form.date);
    setShowForm(false);
    setEditing(null);
  };

  const deleteEntry = (entry: WorkEntry) => {
    if (entry.isLocked) {
      setNotice('This row is locked. Click the lock icon on the row to unlock it before deleting.');
      return;
    }
    const snippet = entry.activity.length > 40 ? `${entry.activity.slice(0, 40)}...` : entry.activity;
    if (window.confirm(`Delete "${snippet}"? This cannot be undone unless you have a backup.`)) {
      setEntries(old => old.filter(e => e.id !== entry.id));
      if (editing?.id === entry.id) {
        setShowForm(false);
        setEditing(null);
      }
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
      setNotice('Entry deleted.');
    }
  };

  const deleteSelectedEntries = () => {
    const visibleSelected = visibleEntries.filter(e => selectedRowIds.has(e.id));
    if (visibleSelected.length === 0) return;

    const lockedCount = visibleSelected.filter(e => e.isLocked).length;
    if (lockedCount > 0) {
      setNotice(`${lockedCount} of the selected rows are locked. Unlock them first to delete.`);
      return;
    }

    if (window.confirm(`Delete ${visibleSelected.length} selected entries? This cannot be undone unless you have a backup.`)) {
      const idsToDelete = new Set(visibleSelected.map(e => e.id));
      setEntries(old => old.filter(e => !idsToDelete.has(e.id)));
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
      setNotice(`Deleted ${visibleSelected.length} entries.`);
    }
  };

  const copyEntryToDate = (entry: WorkEntry) => {
    const now = new Date().toISOString();
    setEntries(old => [
      ...old,
      {
        ...entry,
        id: makeId(),
        date: selectedDate,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setNotice(`Copied entry to selected date.`);
  };

  const promotePlanToToday = (entry: WorkEntry) => {
    const today = todayISO();
    const now = new Date().toISOString();
    const promotedEntry: WorkEntry = {
      ...entry,
      id: makeId(),
      date: today,
      taskCategory: "A Today's Work",
      workDone: 'B In Progress',
      createdAt: now,
      updatedAt: now,
    };

    setEntries(old => [...old, promotedEntry]);
    setSelectedDate(today);
    setNotice(`Promoted plan to today's work (${formatSheetDate(today)}) as "In Progress".`);
  };

  const promoteAllPlansToToday = () => {
    // Collect all Tomorrow's Plan from the current visible view / selected date
    const plans = (view === 'day' ? dayEntries : visibleEntries).filter(
      e => e.taskCategory === "B Tomorrow's Plan"
    );
    if (plans.length === 0) {
      setNotice('No "Tomorrow\'s Plan" entries found to carry forward.');
      return;
    }

    const today = todayISO();
    const now = new Date().toISOString();
    const promotedList: WorkEntry[] = plans.map(p => ({
      ...p,
      id: makeId(),
      date: today,
      taskCategory: "A Today's Work" as TaskCategory,
      workDone: 'B In Progress' as WorkOutcome,
      createdAt: now,
      updatedAt: now,
    }));

    setEntries(old => [...old, ...promotedList]);
    setSelectedDate(today);
    setNotice(`Carried forward ${promotedList.length} plan(s) to Today's Work (${formatSheetDate(today)})!`);
  };

  const moveRow = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= visibleEntries.length) return;

    const currentEntry = visibleEntries[index];
    const targetEntry = visibleEntries[targetIndex];
    if (currentEntry.isLocked || targetEntry.isLocked) {
      setNotice('Cannot reorder rows when either row is locked.');
      return;
    }

    setEntries(old => {
      const currentGlobalIdx = old.findIndex(e => e.id === currentEntry.id);
      const targetGlobalIdx = old.findIndex(e => e.id === targetEntry.id);
      if (currentGlobalIdx === -1 || targetGlobalIdx === -1) return old;

      const updated = [...old];
      let [removed] = updated.splice(currentGlobalIdx, 1);
      if (groupByCategory && currentEntry.taskCategory !== targetEntry.taskCategory) {
        removed = { ...removed, taskCategory: targetEntry.taskCategory, updatedAt: new Date().toISOString() };
      }
      updated.splice(targetGlobalIdx, 0, removed);
      return updated;
    });
  };

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    const item = entries.find(x => x.id === id);
    if (item?.isLocked) {
      e.preventDefault();
      return;
    }
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!targetId || !draggedId || draggedId === targetId) {
      setDropTarget(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const position = relY < rect.height / 2 ? 'above' : 'below';
    setDropTarget({ id: targetId, position });
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDropTarget(null);
      return;
    }

    const sourceItem = entries.find(x => x.id === draggedId);
    const targetItem = entries.find(x => x.id === targetId);
    if (sourceItem?.isLocked || targetItem?.isLocked) {
      setNotice('Cannot reorder locked rows.');
      setDraggedId(null);
      setDropTarget(null);
      return;
    }

    setEntries(old => {
      const sourceIdx = old.findIndex(item => item.id === draggedId);
      if (sourceIdx === -1) return old;

      const updated = [...old];
      let [movedItem] = updated.splice(sourceIdx, 1);
      let targetIdx = updated.findIndex(item => item.id === targetId);
      if (targetIdx === -1) return old;

      if (dropTarget?.position === 'below') {
        targetIdx += 1;
      }
      if (groupByCategory && targetItem && movedItem.taskCategory !== targetItem.taskCategory) {
        movedItem = { ...movedItem, taskCategory: targetItem.taskCategory, updatedAt: new Date().toISOString() };
      }
      updated.splice(targetIdx, 0, movedItem);
      return updated;
    });

    setDraggedId(null);
    setDropTarget(null);
    setNotice('Row reordered.');
  };

  const updateOutcome = (entry: WorkEntry, workDone: WorkOutcome) => {
    if (entry.isLocked) {
      setNotice('Cannot modify outcome of a locked row.');
      return;
    }
    setEntries(old =>
      old.map(e => (e.id === entry.id ? { ...e, workDone, updatedAt: new Date().toISOString() } : e))
    );
  };

  const handleCopyForSheet = async (targets: WorkEntry[], customMessage?: string, singleRowNumber?: number) => {
    if (!targets.length) {
      setNotice('No tasks available to copy.');
      return;
    }

    const currentBase = singleRowNumber !== undefined ? singleRowNumber : startRowNo;
    const { tsvText, htmlTable } = formatEntriesForSheet(
      targets,
      includeHeadersInCopy,
      sheetDateFormat,
      currentBase
    );
    const success = await copyToClipboard(tsvText, htmlTable);
    if (success) {
      if (targets.length === 1) {
        setRecentlyCopiedRowId(targets[0].id);
        window.setTimeout(() => {
          setRecentlyCopiedRowId(prev => (prev === targets[0].id ? null : prev));
        }, 1500);
      }

      if (singleRowNumber !== undefined) {
        setNotice(customMessage || `Copied 1 row (#${singleRowNumber}) for Google Sheet!`);
      } else {
        const nextStart = currentBase + targets.length;
        setStartRowNo(nextStart);
        const endRow = currentBase + targets.length - 1;
        setNotice(
          customMessage ||
            `Copied ${targets.length} ${targets.length === 1 ? 'task' : 'tasks'} (Rows #${currentBase} to #${endRow}). Next start set to #${nextStart}!`
        );
      }
    } else {
      setNotice('Failed to copy to clipboard. Please check browser permissions.');
    }
  };

  const downloadFile = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    downloadFile(
      `work-log-backup-${todayISO()}.json`,
      JSON.stringify(
        {
          version: 3,
          exportedAt: new Date().toISOString(),
          modules,
          entries,
        },
        null,
        2
      ),
      'application/json'
    );
    setNotice('JSON backup exported (includes internal remarks).');
  };

  const exportCSV = () => {
    const rows = [
      [
        'No.',
        'Date',
        'Task',
        'Module / Area',
        'Activity',
        'Work Done / Outcome',
        'Time Spent (hrs)',
        'Type',
        'Ticket / Reference / Remarks',
      ],
      ...visibleEntries.map((e, idx) => [
        startRowNo + idx,
        sheetDateFormat === 'DD-MMM-YY' ? formatSheetDate(e.date) : e.date,
        e.taskCategory,
        e.module,
        e.activity,
        e.workDone || '',
        e.hours && Number(e.hours) > 0 ? Number(e.hours).toFixed(2) : '',
        e.type || '',
        e.reference || '',
      ]),
    ];
    const csv = rows
      .map(row => row.map(escapeCSVCell).join(','))
      .join('\r\n');

    downloadFile(
      `work-log-${view === 'day' ? selectedDate : monthKey(selectedDate)}.csv`,
      '\ufeff' + csv,
      'text/csv;charset=utf-8'
    );
    setNotice('CSV exported matching Google Sheet columns.');
  };

  const importJSON = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Selected file is not valid JSON.');
      }

      const incoming: any[] = Array.isArray(parsed) ? parsed : (parsed && parsed.entries);
      if (!Array.isArray(incoming)) {
        throw new Error('This file does not contain a recognized work entry list.');
      }

      const normalized = incoming.map(normalizeEntry);
      if (!normalized.length && incoming.length) {
        throw new Error('No valid entries were found in this backup.');
      }

      setEntries(old => {
        const map = new Map(old.map(e => [e.id, e]));
        normalized.forEach(e => map.set(e.id, e));
        return Array.from(map.values());
      });

      if (parsed && Array.isArray(parsed.modules)) {
        const validModNames = parsed.modules
          .filter((m: unknown) => typeof m === 'string')
          .map((m: string) => m.trim())
          .filter(Boolean);
        if (validModNames.length > 0) {
          setModules(old => Array.from(new Set([...old, ...validModNames])));
        }
      }
      setNotice(`Imported ${normalized.length} entries. Existing matching IDs were updated.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not import backup.');
    }
    if (importRef.current) importRef.current.value = '';
  };

  const syncToCloud = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl || cloudSyncUrl).trim();
    if (!targetUrl) {
      setNotice('Please enter your Google Apps Script Web App URL first.');
      return;
    }

    setIsSyncing(true);
    setNotice('Backing up data to personal cloud Google Sheet...');

    try {
      const payload = {
        version: 3,
        exportedAt: new Date().toISOString(),
        modules,
        entries,
      };

      // Use text/plain to avoid CORS preflight options block with Google Apps Script
      await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        mode: 'no-cors',
      });

      const nowStr = new Date().toLocaleString();
      setLastSyncedAt(nowStr);
      try {
        localStorage.setItem(CLOUD_LAST_SYNC_KEY, nowStr);
      } catch {
        // storage handled
      }
      setNotice(`Cloud backup synced successfully (${entries.length} entries)!`);
    } catch (err) {
      setNotice(err instanceof Error ? `Cloud sync failed: ${err.message}` : 'Cloud sync failed. Check your Web App URL.');
    } finally {
      setIsSyncing(false);
    }
  };

  const restoreFromCloud = async () => {
    const targetUrl = cloudSyncUrl.trim();
    if (!targetUrl) {
      setNotice('Please enter your Google Apps Script Web App URL first.');
      return;
    }

    if (!window.confirm('Restore from personal cloud backup? This will merge cloud entries with your current entries.')) {
      return;
    }

    setIsSyncing(true);
    setNotice('Fetching cloud backup from personal Google Sheet...');

    try {
      const resp = await fetch(targetUrl);
      const parsed = await resp.json();

      const incoming: any[] = Array.isArray(parsed) ? parsed : (parsed && parsed.entries);
      if (!Array.isArray(incoming) || incoming.length === 0) {
        throw new Error('No entries found in cloud backup yet.');
      }

      const normalized = incoming.map(normalizeEntry);
      setEntries(old => {
        const map = new Map(old.map(e => [e.id, e]));
        normalized.forEach(e => map.set(e.id, e));
        return Array.from(map.values());
      });

      if (parsed && Array.isArray(parsed.modules)) {
        const validModNames = parsed.modules
          .filter((m: unknown) => typeof m === 'string')
          .map((m: string) => m.trim())
          .filter(Boolean);
        if (validModNames.length > 0) {
          setModules(old => Array.from(new Set([...old, ...validModNames])));
        }
      }

      setNotice(`Restored ${normalized.length} entries from personal cloud backup!`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not restore from cloud backup.');
    } finally {
      setIsSyncing(false);
    }
  };

  const addModule = () => {
    const value = moduleDraft.trim();
    if (!value) {
      setNotice('Please enter a module name.');
      return;
    }
    if (modules.some(m => m.toLowerCase() === value.toLowerCase())) {
      setNotice(`Module "${value}" already exists.`);
      return;
    }
    setModules(old => [...old, value]);
    setModuleDraft('');
    setNotice(`Added module "${value}".`);
  };

  const resetToCompanyModules = () => {
    if (window.confirm('Reset the module list to the 9 official company modules?')) {
      setModules(companyModules);
      setNotice('Reset to official company modules.');
    }
  };



  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-minimized' : ''}`}>
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark" title="My Work Log">
            <BriefcaseBusiness size={20} />
          </div>
          {!sidebarCollapsed && (
            <div className="brand-copy">
              <strong>My Work Log</strong>
              <span>Company Sheet Sync</span>
            </div>
          )}
          <button
            className="sidebar-collapse-btn"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {!sidebarCollapsed && <div className="side-label">WORKSPACE</div>}
        <button
          className={`nav-item ${view === 'day' ? 'active' : ''}`}
          onClick={() => setView('day')}
          title="Daily log"
        >
          <LayoutDashboard size={18} />
          {!sidebarCollapsed && <span>Daily log</span>}
        </button>
        <button
          className={`nav-item ${view === 'month' ? 'active' : ''}`}
          onClick={() => setView('month')}
          title="Monthly history"
        >
          <CalendarRange size={18} />
          {!sidebarCollapsed && <span>Monthly history</span>}
        </button>

        <div className="sidebar-bottom">
          {!sidebarCollapsed && (
            <>
              <div className="sheet-sync-card">
                <div className="sheet-sync-header">
                  <ClipboardCopy size={16} />
                  <strong>Google Sheet Ready</strong>
                </div>
                <p>Pasting aligns directly to the 9 company columns. Col 6 &quot;Work Done / Outcome&quot; is the status DDL.</p>
              </div>

              <div className="privacy-card">
                <div className="privacy-icon">
                  <Database size={17} />
                </div>
                <div>
                  <strong>Stored on this PC</strong>
                  <p>Your entries stay in this browser. Back up regularly.</p>
                </div>
              </div>
            </>
          )}

          <button
            className="nav-item"
            onClick={() => setShowSettings(true)}
            title="Settings & backup"
          >
            <Settings2 size={18} />
            {!sidebarCollapsed && <span>Settings & backup</span>}
          </button>
          {!sidebarCollapsed && <div className="version-label">ENTERPRISE COMPATIBLE · V3.0</div>}
        </div>
      </aside>

      <main className={`main-area ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button sidebar-toggle-btn"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} /> <span>{view === 'day' ? 'Daily log' : 'Monthly history'}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle-btn"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="sheet-badge">
              <Sparkles size={13} />
              Company Sheet Formatted ({sheetDateFormat})
            </span>
            <span className="local-badge">
              <span />
              Local-only
            </span>
            <button
              className="icon-button"
              title="Settings and backup"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{view === 'day' ? 'YOUR DAILY OVERVIEW' : 'YOUR WORK HISTORY'}</div>
              <h1>{view === 'day' ? 'Daily work log' : 'Monthly history'}</h1>
              <p className="subtitle">
                {view === 'day'
                  ? 'Track tasks, log hours, and copy directly into your company Google Sheet.'
                  : 'Review all tasks, modules, and hours across the entire month.'}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="primary-button sheet-btn"
                title="Copy all currently filtered tasks in Google Sheet format"
                onClick={() => handleCopyForSheet(visibleEntries)}
              >
                <ClipboardCopy size={17} />
                <span>Copy for Google Sheet</span>
                <span className="count-pill">{visibleEntries.length}</span>
              </button>
              <button className="primary-button" onClick={openNew}>
                <Plus size={18} /> Add work entry
              </button>
            </div>
          </div>

          <section className="date-toolbar">
            <div className="date-nav">
              <button className="icon-button" onClick={() => changeDate(-1)} aria-label="Previous date">
                <ChevronLeft size={18} />
              </button>
              <div className="date-title">
                <CalendarDays size={18} />
                <div>
                  <strong>{view === 'day' ? prettyDate(selectedDate) : monthLabel(selectedDate)}</strong>
                  <span>{view === 'day' ? 'Selected work day' : `${monthDays} active ${monthDays === 1 ? 'day' : 'days'}`}</span>
                </div>
              </div>
              <button className="icon-button" onClick={() => changeDate(1)} aria-label="Next date">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="date-controls">
              <input
                aria-label="Select date"
                type={view === 'day' ? 'date' : 'month'}
                value={view === 'day' ? selectedDate : selectedDate.slice(0, 7)}
                onChange={e => {
                  const val = e.target.value;
                  if (!val) return;
                  setSelectedDate(view === 'day' ? val : `${val}-01`);
                }}
              />
              <button className="secondary-button" onClick={() => setSelectedDate(todayISO())}>
                Today
              </button>
            </div>
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon teal">
                <Clock3 size={19} />
              </div>
              <div className="stat-copy">
                <span>{view === 'day' ? 'Hours logged' : 'Hours this month'}</span>
                <strong>
                  {fmtHours(view === 'day' ? totalHours : monthHours)} <small>hrs</small>
                </strong>
                <em>{durationLabel(view === 'day' ? totalHours : monthHours)} total</em>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue">
                <BriefcaseBusiness size={19} />
              </div>
              <div className="stat-copy">
                <span>{view === 'day' ? 'Tasks recorded' : 'Entries this month'}</span>
                <strong>{view === 'day' ? dayEntries.length : monthEntries.length}</strong>
                <em>{view === 'day' ? `${inProgressCount} in progress` : `${monthDays} active days`}</em>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">
                <CircleCheck size={19} />
              </div>
              <div className="stat-copy">
                <span>{view === 'day' ? 'Completed' : 'Completed this month'}</span>
                <strong>{view === 'day' ? doneCount : monthEntries.filter(e => e.workDone === 'A Completed').length}</strong>
                <em>{view === 'day' ? 'Marked as A Completed' : 'Total completed tasks'}</em>
              </div>
            </div>
          </section>

          <div className="sheet-columns-guide">
            <div className="guide-title">
              <ClipboardCopy size={15} />
              <strong>Exact Google Sheet Column Layout (9 columns):</strong>
            </div>
            <div className="guide-cols">
              <span>1. No.</span>
              <span>2. Date ({sheetDateFormat})</span>
              <span>3. Task</span>
              <span>4. Module / Area</span>
              <span>5. Activity</span>
              <span className="highlight-col">6. Work Done / Outcome (DDL)</span>
              <span>7. Time Spent (hrs)</span>
              <span>8. Type</span>
              <span>9. Ticket / Reference / Remarks</span>
            </div>
          </div>

          <section className="entries-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-title-with-date">
                  <h2>{view === 'day' ? 'Work entries' : 'All monthly entries'}</h2>
                  <span className="panel-work-date-badge" title="Active date for these work entries">
                    <CalendarDays size={13} />
                    <strong>{formatSheetDate(selectedDate)}</strong>
                    <span className="date-badge-sep">·</span>
                    <span className="date-badge-full">
                      {view === 'day'
                        ? prettyDate(selectedDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                        : monthLabel(selectedDate)}
                    </span>
                  </span>
                </div>
                <p>
                  {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} shown
                  {selectedRowIds.size > 0 && ` · ${selectedRowIds.size} selected`}
                </p>
              </div>
              <div className="panel-action-buttons">
                {/* Table Density Switcher */}
                <div className="table-density-switch" title="Row density">
                  <button
                    type="button"
                    className={`density-btn ${tableDensity === 'compact' ? 'active' : ''}`}
                    onClick={() => setTableDensity('compact')}
                    title="Compact view (fits more rows)"
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    className={`density-btn ${tableDensity === 'normal' ? 'active' : ''}`}
                    onClick={() => setTableDensity('normal')}
                    title="Normal view"
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    className={`density-btn ${tableDensity === 'relaxed' ? 'active' : ''}`}
                    onClick={() => setTableDensity('relaxed')}
                    title="Comfortable view (relaxed padding)"
                  >
                    Relaxed
                  </button>
                </div>

                {/* Group by Category Toggle */}
                <button
                  type="button"
                  className={`secondary-button group-toggle-btn ${groupByCategory ? 'is-grouped' : ''}`}
                  onClick={() => setGroupByCategory(prev => !prev)}
                  title={groupByCategory ? "Switch to flat list view" : "Group tasks by category"}
                >
                  <Layers size={14} />
                  <span>{groupByCategory ? 'Grouped' : 'Flat'}</span>
                </button>

                {/* Columns Visibility Dropdown */}
                <div className="columns-menu-container">
                  <button
                    type="button"
                    className={`secondary-button columns-toggle-btn ${showColumnsMenu ? 'active' : ''}`}
                    onClick={() => setShowColumnsMenu(prev => !prev)}
                    title="Customize visible columns"
                  >
                    <Columns size={14} />
                    <span>Columns</span>
                  </button>
                  {showColumnsMenu && (
                    <div className="columns-dropdown-menu">
                      <div className="columns-menu-header">Customize Columns</div>
                      <div className="columns-menu-list">
                        {[
                          { key: 'order', label: 'Order / Drag Handles' },
                          { key: 'rowNo', label: 'Google Sheet Row #' },
                          { key: 'task', label: 'Task Category & Date' },
                          { key: 'module', label: 'Module / Area' },
                          { key: 'outcome', label: 'Work Done / Outcome' },
                          { key: 'hours', label: 'Time (Hours)' },
                          { key: 'type', label: 'Work Type' },
                          { key: 'reference', label: 'Ticket / Reference' },
                          { key: 'remarks', label: 'App Remarks' },
                        ].map(col => (
                          <label key={col.key} className="columns-checkbox-item">
                            <input
                              type="checkbox"
                              checked={visibleColumns[col.key as keyof VisibleColumns]}
                              onChange={e =>
                                setVisibleColumns(prev => ({
                                  ...prev,
                                  [col.key]: e.target.checked,
                                }))
                              }
                            />
                            <span>{col.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="columns-menu-footer">
                        <button
                          type="button"
                          className="text-link-btn"
                          onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
                        >
                          Reset all columns
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <label className="header-toggle" title="Include the column names row when copying to clipboard">
                  <input
                    type="checkbox"
                    checked={includeHeadersInCopy}
                    onChange={e => setIncludeHeadersInCopy(e.target.checked)}
                  />
                  <span>Include header row</span>
                </label>

                {visibleEntries.some(e => e.taskCategory === "B Tomorrow's Plan") && (
                  <button
                    className="secondary-button promote-plans-btn"
                    title="Promote all Tomorrow's Plans from this view to Today's Work"
                    onClick={promoteAllPlansToToday}
                  >
                    <ListPlus size={15} /> Carry Forward Plans
                  </button>
                )}

                <div className="sheet-row-tracker" title="Starting row number for Google Sheet Column 1 (No.). Auto-advances after copying!">
                  <span className="sheet-row-label">Start No.#</span>
                  <input
                    type="number"
                    min="1"
                    className="sheet-row-input"
                    value={startRowNo || ''}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setStartRowNo(1);
                        return;
                      }
                      const val = parseInt(raw, 10);
                      if (Number.isFinite(val) && val >= 1) {
                        setStartRowNo(val);
                      }
                    }}
                  />
                </div>

                {(() => {
                  const visibleSelectedList = visibleEntries.filter(e => selectedRowIds.has(e.id));
                  if (!visibleSelectedList.length) return null;
                  return (
                    <div className="selection-action-group">
                      <button
                        className="primary-button sheet-btn small-sheet-btn"
                        title="Copy only selected rows formatted for Google Sheet"
                        onClick={() => handleCopyForSheet(visibleSelectedList)}
                      >
                        <ClipboardCopy size={15} />
                        <span>Copy Selected ({visibleSelectedList.length})</span>
                      </button>
                      <button
                        className="secondary-button danger-button small-action-btn"
                        title="Delete all selected unlocked rows"
                        onClick={deleteSelectedEntries}
                      >
                        <Trash2 size={15} />
                        <span>Delete ({visibleSelectedList.length})</span>
                      </button>
                      <button
                        type="button"
                        className="secondary-button small-action-btn"
                        title="Deselect all rows"
                        onClick={() => setSelectedRowIds(new Set())}
                      >
                        Clear Selection
                      </button>
                    </div>
                  );
                })()}

                <button
                  className="primary-button sheet-btn small-sheet-btn"
                  onClick={() => handleCopyForSheet(visibleEntries)}
                >
                  <ClipboardCopy size={15} />
                  <span>Copy for Google Sheet</span>
                </button>
                <button className="secondary-button export-button" onClick={exportCSV}>
                  <FileSpreadsheet size={16} /> Export CSV
                </button>
              </div>
            </div>

            <div className="filters-row">
              <div className="search-box">
                <Search size={17} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search activity, ticket, remarks, module, type..."
                />
              </div>
              <select
                aria-label="Filter by task category"
                value={taskFilter}
                onChange={e => setTaskFilter(e.target.value)}
              >
                <option>All tasks</option>
                {taskCategories.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                aria-label="Filter by module"
                value={moduleFilter}
                onChange={e => setModuleFilter(e.target.value)}
              >
                <option value="All modules">All modules</option>
                <option value="(Blank)">(Blank / None)</option>
                {modules.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                aria-label="Filter by work done outcome"
                value={outcomeFilter}
                onChange={e => setOutcomeFilter(e.target.value)}
              >
                <option>All outcomes</option>
                {outcomeOptions.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                aria-label="Filter by type"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
              >
                <option>All types</option>
                {workTypes.map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Active Filter Chips */}
            {hasActiveFilters && (
              <div className="active-filter-chips">
                <span className="active-filters-label">Active filters:</span>
                {query && (
                  <span className="filter-chip">
                    Search: "{query}"
                    <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {taskFilter !== 'All tasks' && (
                  <span className="filter-chip">
                    Task: {taskFilter}
                    <button type="button" onClick={() => setTaskFilter('All tasks')} aria-label="Clear task filter">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {moduleFilter !== 'All modules' && (
                  <span className="filter-chip">
                    Module: {moduleFilter}
                    <button type="button" onClick={() => setModuleFilter('All modules')} aria-label="Clear module filter">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {outcomeFilter !== 'All outcomes' && (
                  <span className="filter-chip">
                    Outcome: {outcomeFilter}
                    <button type="button" onClick={() => setOutcomeFilter('All outcomes')} aria-label="Clear outcome filter">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {typeFilter !== 'All types' && (
                  <span className="filter-chip">
                    Type: {typeFilter}
                    <button type="button" onClick={() => setTypeFilter('All types')} aria-label="Clear type filter">
                      <X size={12} />
                    </button>
                  </span>
                )}
                <button type="button" className="clear-all-filters-btn" onClick={resetAllFilters}>
                  <RotateCcw size={12} /> Clear all
                </button>
              </div>
            )}

            {visibleEntries.length ? (
              <div className="table-wrap" data-density={tableDensity}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '32px', textAlign: 'center' }} className="select-col sticky-left">
                        <button
                          type="button"
                          className="row-select-btn"
                          title={visibleEntries.length > 0 && visibleEntries.every(e => selectedRowIds.has(e.id)) ? "Deselect all visible rows" : "Select all visible rows"}
                          onClick={() => toggleSelectAll(visibleEntries.map(e => e.id))}
                        >
                          {visibleEntries.length > 0 && visibleEntries.every(e => selectedRowIds.has(e.id)) ? (
                            <CheckSquare size={16} className="checked-icon" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      {visibleColumns.order && (
                        <th style={{ width: '42px', textAlign: 'center' }}>ORDER</th>
                      )}
                      {visibleColumns.rowNo && (
                        <th style={{ width: '38px' }} className="row-num-col">NO.</th>
                      )}
                      {visibleColumns.task && <th>TASK</th>}
                      {visibleColumns.module && <th>MODULE / AREA</th>}
                      <th>ACTIVITY (TASK DESCRIPTION)</th>
                      {visibleColumns.outcome && <th>WORK DONE / OUTCOME (DDL)</th>}
                      {visibleColumns.hours && <th>TIME</th>}
                      {visibleColumns.type && <th>TYPE</th>}
                      {visibleColumns.reference && <th>TICKET / REFERENCE</th>}
                      {visibleColumns.remarks && <th>APP REMARKS (INTERNAL)</th>}
                      <th className="actions-header-col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDropTarget(null);
                      }
                    }}
                  >
                    {groupedEntries.map(group => {
                      const isGroupedMode = groupByCategory && group.category !== 'all';
                      const isCollapsed = collapsedCategories.has(group.category);
                      const groupTotalHours = group.entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);

                      return (
                        <Fragment key={`group-wrapper-${group.category}`}>
                          {isGroupedMode && (
                            <tr className="table-group-header-row" key={`group-hdr-${group.category}`}>
                              <td colSpan={activeColumnCount} className="table-group-header-cell">
                                <div className="table-group-header-content">
                                  <button
                                    type="button"
                                    className="group-collapse-btn"
                                    onClick={() => toggleCategoryCollapse(group.category)}
                                    title={isCollapsed ? "Expand section" : "Collapse section"}
                                  >
                                    {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                                    <span className={`task-badge ${getTaskCategoryClass(group.category as TaskCategory)}`}>
                                      {group.title}
                                    </span>
                                    <span className="group-count-pill">{group.entries.length} {group.entries.length === 1 ? 'task' : 'tasks'}</span>
                                    <span className="group-hours-pill">{fmtHours(groupTotalHours)} hrs</span>
                                  </button>
                                  {group.category === "B Tomorrow's Plan" && (
                                    <button
                                      type="button"
                                      className="group-quick-action-btn"
                                      title="Carry forward all plans from this section to Today's Work"
                                      onClick={promoteAllPlansToToday}
                                    >
                                      <ListPlus size={13} />
                                      <span>Promote to Today</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}

                          {!isCollapsed &&
                            group.entries.map(entry => {
                              const index = entryIndexMap.get(entry.id) ?? 0;
                              const isSelected = selectedRowIds.has(entry.id);
                              const isLocked = Boolean(entry.isLocked);
                              const isEditingHours = inlineEditingCell?.id === entry.id && inlineEditingCell.field === 'hours';
                              const isEditingRef = inlineEditingCell?.id === entry.id && inlineEditingCell.field === 'reference';
                              const isEditingActivity = inlineEditingCell?.id === entry.id && inlineEditingCell.field === 'activity';
                              const isDragging = draggedId === entry.id;
                              const isDropAbove = dropTarget?.id === entry.id && dropTarget.position === 'above';
                              const isDropBelow = dropTarget?.id === entry.id && dropTarget.position === 'below';
                              const isCopiedPulse = recentlyCopiedRowId === entry.id;
                              const isMenuOpen = activeMoreMenuId === entry.id || activeOutcomeMenuId === entry.id;
                              const isNearBottom = visibleEntries.length > 2 && index >= visibleEntries.length - 2;

                              return (
                                <tr
                                  key={entry.id}
                                  draggable={!isLocked}
                                  onDragStart={e => !isLocked && handleDragStart(e, entry.id)}
                                  onDragOver={e => !isLocked && handleDragOver(e, entry.id)}
                                  onDrop={e => !isLocked && handleDrop(e, entry.id)}
                                  onDragEnd={() => {
                                    setDraggedId(null);
                                    setDropTarget(null);
                                  }}
                                  className={`table-row-item ${isMenuOpen ? 'has-active-menu' : ''} ${isDragging ? 'is-dragging' : ''} ${isSelected ? 'row-selected' : ''} ${isLocked ? 'row-locked' : ''} ${isDropAbove ? 'drop-target-above' : ''} ${isDropBelow ? 'drop-target-below' : ''} ${isCopiedPulse ? 'row-copied-flash' : ''}`}
                                >
                                  <td className="select-cell sticky-left" style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      className="row-select-btn"
                                      title={isSelected ? "Deselect row" : "Select row"}
                                      onClick={() => toggleSelectRow(entry.id)}
                                    >
                                      {isSelected ? (
                                        <CheckSquare size={16} className="checked-icon" />
                                      ) : (
                                        <Square size={16} />
                                      )}
                                    </button>
                                  </td>

                                  {visibleColumns.order && (
                                    <td className="reorder-cell">
                                      <div className="reorder-controls">
                                        <span
                                          className={`drag-handle ${isLocked ? 'disabled-handle' : ''}`}
                                          title={isLocked ? "Row is locked" : "Drag to reorder"}
                                          aria-label="Drag to reorder row"
                                        >
                                          <GripVertical size={14} />
                                        </span>
                                        <div className="arrow-reorder-btns">
                                          <button
                                            type="button"
                                            className="arrow-btn"
                                            disabled={index === 0 || isLocked}
                                            title={isLocked ? "Row locked" : "Move row up"}
                                            aria-label="Move row up"
                                            onClick={() => moveRow(index, 'up')}
                                          >
                                            <ArrowUp size={11} />
                                          </button>
                                          <button
                                            type="button"
                                            className="arrow-btn"
                                            disabled={index === visibleEntries.length - 1 || isLocked}
                                            title={isLocked ? "Row locked" : "Move row down"}
                                            aria-label="Move row down"
                                            onClick={() => moveRow(index, 'down')}
                                          >
                                            <ArrowDown size={11} />
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  )}

                                  {visibleColumns.rowNo && (
                                    <td className="row-num row-num-col" title={`Google Sheet Row #${startRowNo + index}`}>
                                      {startRowNo + index}
                                    </td>
                                  )}

                                  {visibleColumns.task && (
                                    <td>
                                      <span className={`task-badge ${getTaskCategoryClass(entry.taskCategory)}`}>
                                        {entry.taskCategory}
                                      </span>
                                      {isLocked && (
                                        <span className="row-locked-badge" title="Row locked against edits and reordering">
                                          <Lock size={10} />
                                          <span>Locked</span>
                                        </span>
                                      )}
                                      {view === 'month' && (
                                        <span className="entry-date">
                                          {formatSheetDate(entry.date)}
                                        </span>
                                      )}
                                    </td>
                                  )}

                                  {visibleColumns.module && (
                                    <td>
                                      <span className={`module-pill ${getModuleClass(entry.module)}`}>
                                        {entry.module || '—'}
                                      </span>
                                    </td>
                                  )}

                                  <td className="activity-cell">
                                    {isEditingActivity ? (
                                      <div className="inline-activity-editor" onClick={e => e.stopPropagation()}>
                                        <textarea
                                          autoFocus
                                          rows={3}
                                          className="inline-cell-input inline-activity-input"
                                          value={inlineEditingCell.value}
                                          onChange={e =>
                                            setInlineEditingCell({ ...inlineEditingCell, value: e.target.value })
                                          }
                                          onKeyDown={e => {
                                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                              saveInlineEdit(entry.id, 'activity', inlineEditingCell.value);
                                            } else if (e.key === 'Escape') {
                                              e.stopPropagation();
                                              cancelInlineEdit();
                                            }
                                          }}
                                          onBlur={() => saveInlineEdit(entry.id, 'activity', inlineEditingCell.value)}
                                        />
                                        <div className="inline-activity-hints">
                                          <span>Ctrl+Enter or click outside to save · Esc to cancel</span>
                                        </div>
                                      </div>
                                    ) : (
                                      (() => {
                                        const isExpanded = expandedActivityIds.has(entry.id);
                                        const isLong = (entry.activity.match(/\n/g) || []).length >= 3 || entry.activity.length > 140;
                                        return (
                                          <div
                                            className={`activity-wrap ${isExpanded ? 'is-expanded' : ''} ${isLong ? 'can-expand' : ''}`}
                                            onClick={() => isLong && toggleActivityExpand(entry.id)}
                                            onDoubleClick={() => {
                                              if (!isLocked) {
                                                setInlineEditingCell({
                                                  id: entry.id,
                                                  field: 'activity',
                                                  value: entry.activity,
                                                });
                                              }
                                            }}
                                            title={
                                              isLong
                                                ? isExpanded
                                                  ? 'Click to collapse (Double-click to fast edit)'
                                                  : 'Click to expand (Double-click to fast edit)'
                                                : isLocked
                                                ? undefined
                                                : 'Double-click to fast edit activity'
                                            }
                                          >
                                            <div className="activity-text">{entry.activity}</div>
                                            <div className="activity-footer-line">
                                              {isLong && (
                                                <span className="activity-expand-hint">
                                                  {isExpanded ? 'Show less' : '...more'}
                                                </span>
                                              )}
                                              {!isLocked && (
                                                <span
                                                  className="activity-edit-affordance"
                                                  onClick={e => {
                                                    e.stopPropagation();
                                                    setInlineEditingCell({
                                                      id: entry.id,
                                                      field: 'activity',
                                                      value: entry.activity,
                                                    });
                                                  }}
                                                  title="Fast edit description inline"
                                                >
                                                  <Pencil size={11} />
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })()
                                    )}
                                  </td>

                                  {/* Custom Interactive Outcome Popover */}
                                  {visibleColumns.outcome && (
                                    <td className={`outcome-cell ${activeOutcomeMenuId === entry.id ? 'has-active-menu' : ''}`}>
                                      <div className="outcome-popover-container">
                                        <button
                                          type="button"
                                          disabled={isLocked}
                                          className={`outcome-pill-btn ${getOutcomeClass(entry.workDone)} ${isLocked ? 'locked' : ''}`}
                                          title={isLocked ? "Row is locked" : "Click to change outcome"}
                                          onClick={() => {
                                            if (!isLocked) {
                                              setActiveOutcomeMenuId(prev => (prev === entry.id ? null : entry.id));
                                            }
                                          }}
                                        >
                                          <span className={`outcome-dot ${outcomeMeta[entry.workDone]?.dotClass || 'dot-empty'}`}>
                                            {outcomeMeta[entry.workDone]?.icon || '○'}
                                          </span>
                                          <span className="outcome-text">
                                            {outcomeMeta[entry.workDone]?.shortLabel || entry.workDone || 'Set Outcome'}
                                          </span>
                                          {!isLocked && <ChevronDown size={11} className="outcome-chevron" />}
                                        </button>

                                        {activeOutcomeMenuId === entry.id && !isLocked && (
                                          <div className={`outcome-menu-dropdown ${isNearBottom ? 'open-upwards' : ''}`}>
                                            <div className="outcome-menu-title">Select Work Outcome</div>
                                            <button
                                              type="button"
                                              className={`outcome-menu-item ${!entry.workDone ? 'selected' : ''}`}
                                              onClick={() => {
                                                updateOutcome(entry, '');
                                                setActiveOutcomeMenuId(null);
                                              }}
                                            >
                                              <span className="outcome-dot dot-empty">○</span>
                                              <span>(None / Blank)</span>
                                              {!entry.workDone && <Check size={14} className="outcome-check-icon" />}
                                            </button>
                                            {outcomeOptions.map(outcome => {
                                              const meta = outcomeMeta[outcome];
                                              return (
                                                <button
                                                  key={outcome}
                                                  type="button"
                                                  className={`outcome-menu-item ${entry.workDone === outcome ? 'selected' : ''}`}
                                                  onClick={() => {
                                                    updateOutcome(entry, outcome);
                                                    setActiveOutcomeMenuId(null);
                                                  }}
                                                >
                                                  <span className={`outcome-dot ${meta.dotClass}`}>{meta.icon}</span>
                                                  <span className="outcome-menu-label">{meta.label}</span>
                                                  {entry.workDone === outcome && <Check size={14} className="outcome-check-icon" />}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  )}

                                  {visibleColumns.hours && (
                                    <td
                                      className={`editable-cell ${isLocked ? 'locked-cell' : ''}`}
                                      title={isLocked ? "Row is locked" : "Click to fast-edit hours"}
                                      onClick={() => {
                                        if (!isLocked && !isEditingHours) {
                                          setInlineEditingCell({
                                            id: entry.id,
                                            field: 'hours',
                                            value: entry.hours ? String(entry.hours) : '',
                                          });
                                        }
                                      }}
                                    >
                                      {isEditingHours ? (
                                        <input
                                          autoFocus
                                          type="number"
                                          min="0"
                                          max="24"
                                          step="0.01"
                                          className="inline-cell-input hours-inline-input"
                                          value={inlineEditingCell.value}
                                          onClick={e => e.stopPropagation()}
                                          onChange={e =>
                                            setInlineEditingCell({ ...inlineEditingCell, value: e.target.value })
                                          }
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              saveInlineEdit(entry.id, 'hours', inlineEditingCell.value);
                                            } else if (e.key === 'Escape') {
                                              e.stopPropagation();
                                              cancelInlineEdit();
                                            }
                                          }}
                                          onBlur={() => saveInlineEdit(entry.id, 'hours', inlineEditingCell.value)}
                                        />
                                      ) : entry.hours && Number(entry.hours) > 0 ? (
                                        <>
                                          <strong className="hours-value">{fmtHours(entry.hours)}</strong>
                                          <span className="duration-sub">{durationLabel(entry.hours)}</span>
                                        </>
                                      ) : (
                                        <span className="muted quick-edit-placeholder">+ hrs</span>
                                      )}
                                    </td>
                                  )}

                                  {visibleColumns.type && (
                                    <td>
                                      {entry.type ? (
                                        <span className={`type-tag ${getTypeClass(entry.type)}`}>{entry.type}</span>
                                      ) : (
                                        <span className="muted">—</span>
                                      )}
                                    </td>
                                  )}

                                  {visibleColumns.reference && (
                                    <td
                                      className={`editable-cell ${isLocked ? 'locked-cell' : ''}`}
                                      title={isLocked ? "Row is locked" : "Click to fast-edit ticket reference"}
                                      onClick={() => {
                                        if (!isLocked && !isEditingRef) {
                                          setInlineEditingCell({
                                            id: entry.id,
                                            field: 'reference',
                                            value: entry.reference || '',
                                          });
                                        }
                                      }}
                                    >
                                      {isEditingRef ? (
                                        <input
                                          autoFocus
                                          type="text"
                                          className="inline-cell-input ref-inline-input"
                                          value={inlineEditingCell.value}
                                          onClick={e => e.stopPropagation()}
                                          onChange={e =>
                                            setInlineEditingCell({ ...inlineEditingCell, value: e.target.value })
                                          }
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              saveInlineEdit(entry.id, 'reference', inlineEditingCell.value);
                                            } else if (e.key === 'Escape') {
                                              e.stopPropagation();
                                              cancelInlineEdit();
                                            }
                                          }}
                                          onBlur={() => saveInlineEdit(entry.id, 'reference', inlineEditingCell.value)}
                                        />
                                      ) : entry.reference ? (
                                        <div className="reference-tag">{entry.reference}</div>
                                      ) : (
                                        <span className="muted quick-edit-placeholder">+ ticket</span>
                                      )}
                                    </td>
                                  )}

                                  {visibleColumns.remarks && (
                                    <td className="remarks-cell">
                                      {entry.appRemarks ? (
                                        <span className="app-remarks-pill" title={entry.appRemarks}>
                                          <StickyNote size={12} />
                                          <span>{entry.appRemarks}</span>
                                        </span>
                                      ) : (
                                        <span className="muted">—</span>
                                      )}
                                    </td>
                                  )}

                                  {/* Streamlined Row Actions with Hover Reveal & 3-Dot Overflow */}
                                  <td className={`actions-col ${activeMoreMenuId === entry.id ? 'has-active-menu' : ''}`}>
                                    <div className="row-actions">
                                      {entry.taskCategory === "B Tomorrow's Plan" && (
                                        <button
                                          className="tiny-action promote-row-action"
                                          title="Promote this plan to Today's Work"
                                          disabled={isLocked}
                                          onClick={() => promotePlanToToday(entry)}
                                        >
                                          <ArrowRightCircle size={15} />
                                        </button>
                                      )}

                                      <button
                                        className="tiny-action copy-sheet-action"
                                        title={`Copy this row for Google Sheet (Row #${startRowNo + index})`}
                                        onClick={() =>
                                          handleCopyForSheet([entry], undefined, startRowNo + index)
                                        }
                                      >
                                        <ClipboardCopy size={15} />
                                      </button>

                                      {isLocked ? (
                                        <button
                                          type="button"
                                          className="tiny-action lock-action-btn is-locked-btn"
                                          title="Row is locked. Click to unlock"
                                          onClick={() => toggleLockRow(entry)}
                                        >
                                          <Lock size={15} />
                                        </button>
                                      ) : (
                                        <button
                                          className="tiny-action"
                                          title="Edit entry"
                                          onClick={() => openEdit(entry)}
                                        >
                                          <Pencil size={15} />
                                        </button>
                                      )}

                                      {/* 3-Dot Overflow Menu */}
                                      <div className="more-menu-container">
                                        <button
                                          type="button"
                                          className={`tiny-action more-action-btn ${activeMoreMenuId === entry.id ? 'is-active' : ''}`}
                                          title="More row actions"
                                          onClick={() =>
                                            setActiveMoreMenuId(prev => (prev === entry.id ? null : entry.id))
                                          }
                                        >
                                          <MoreHorizontal size={15} />
                                        </button>

                                        {activeMoreMenuId === entry.id && (
                                          <div className={`row-more-dropdown ${isNearBottom ? 'open-upwards' : ''}`}>
                                            <button
                                              type="button"
                                              className="dropdown-menu-item"
                                              onClick={() => {
                                                toggleLockRow(entry);
                                                setActiveMoreMenuId(null);
                                              }}
                                            >
                                              {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                                              <span>{isLocked ? 'Unlock Row' : 'Lock Row'}</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="dropdown-menu-item"
                                              onClick={() => {
                                                copyEntryToDate(entry);
                                                setActiveMoreMenuId(null);
                                              }}
                                            >
                                              <Copy size={14} />
                                              <span>Duplicate to Date</span>
                                            </button>
                                            {!isLocked && (
                                              <button
                                                type="button"
                                                className="dropdown-menu-item danger-item"
                                                onClick={() => {
                                                  deleteEntry(entry);
                                                  setActiveMoreMenuId(null);
                                                }}
                                              >
                                                <Trash2 size={14} />
                                                <span>Delete Entry</span>
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                  </tbody>

                  {/* Summary Footer Row */}
                  <tfoot>
                    <tr className="table-summary-row">
                      <td className="summary-cell sticky-left" style={{ textAlign: 'center' }}>
                        <span className="summary-count-badge" title="Total visible tasks">
                          {visibleEntries.length}
                        </span>
                      </td>
                      {visibleColumns.order && <td className="summary-empty-cell" />}
                      {visibleColumns.rowNo && (
                        <td className="summary-cell summary-text-muted" title="Sheet row range">
                          {visibleEntries.length === 1
                            ? `#${startRowNo}`
                            : `#${startRowNo}–#${startRowNo + visibleEntries.length - 1}`}
                        </td>
                      )}
                      {visibleColumns.task && (
                        <td className="summary-cell summary-text-muted">
                          {selectedRowIds.size > 0 ? `${selectedRowIds.size} selected` : 'Summary'}
                        </td>
                      )}
                      {visibleColumns.module && <td className="summary-empty-cell" />}
                      <td className="summary-cell summary-activity-progress">
                        <div className="summary-progress-wrap">
                          <div className="summary-progress-text">
                            <span>
                              <strong>{visibleCompletedCount}</strong> of {visibleEntries.length} completed
                            </span>
                            <span className="summary-pct">
                              {Math.round((visibleCompletedCount / (visibleEntries.length || 1)) * 100)}%
                            </span>
                          </div>
                          <div className="summary-progress-bar">
                            <div
                              className="summary-progress-fill"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((visibleCompletedCount / (visibleEntries.length || 1)) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      {visibleColumns.outcome && (
                        <td className="summary-cell summary-outcome-stat">
                          <span className="summary-stat-pill">
                            {visibleInProgressCount} in progress
                          </span>
                        </td>
                      )}
                      {visibleColumns.hours && (
                        <td className="summary-cell summary-hours-cell">
                          <strong className="summary-hours-val">{fmtHours(visibleTotalHours)} hrs</strong>
                          <span className="summary-duration-sub">{durationLabel(visibleTotalHours)}</span>
                        </td>
                      )}
                      {visibleColumns.type && <td className="summary-empty-cell" />}
                      {visibleColumns.reference && <td className="summary-empty-cell" />}
                      {visibleColumns.remarks && <td className="summary-empty-cell" />}
                      <td className="summary-cell summary-actions-cell actions-col">
                        <button
                          type="button"
                          className="table-footer-copy-btn"
                          title="Copy all visible rows for Google Sheet"
                          onClick={() => handleCopyForSheet(visibleEntries)}
                        >
                          <ClipboardCopy size={13} />
                          <span>Copy for Sheet</span>
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <CalendarDays size={25} />
                </div>
                <h3>
                  {hasActiveFilters ? 'No matching entries' : 'Nothing logged here yet'}
                </h3>
                <p>
                  {hasActiveFilters
                    ? 'Try changing or clearing your search and filters.'
                    : 'Add your first task to start building your work log.'}
                </p>
                {hasActiveFilters ? (
                  <button type="button" className="secondary-button reset-filters-btn" onClick={resetAllFilters}>
                    <RotateCcw size={15} /> Reset all filters
                  </button>
                ) : (
                  <button className="primary-button" onClick={openNew}>
                    <Plus size={17} /> Add your first entry
                  </button>
                )}
              </div>
            )}

            <div className="panel-footer">
              <span>
                <Database size={14} /> Automatically saved in this browser
              </span>
              <div className="footer-actions">
                <button
                  className="sheet-link-btn"
                  onClick={() => handleCopyForSheet(visibleEntries)}
                >
                  <ClipboardCopy size={14} /> Copy {visibleEntries.length} tasks for Google Sheet
                </button>
                <button className="text-button" onClick={() => setShowSettings(true)}>
                  Backup & data options <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>

          <div className="bottom-note">
            <span className="note-dot" />
            Private by design <span>·</span> No account, no server, fully local.
          </div>
        </div>
      </main>

      {/* ADD / EDIT MODAL */}
      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              setShowForm(false);
              setEditing(null);
            }
          }}
        >
          <section
            className="modal form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">{editing ? 'UPDATE YOUR RECORD' : 'ADD TO YOUR WORK LOG'}</div>
                <h2 id="form-title">{editing ? 'Edit work entry' : 'New work entry'}</h2>
                <p>Col 6 &quot;Work Done / Outcome&quot; is the DDL status for your sheet.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveEntry}>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Task (Column 3) <b>*</b>
                  </span>
                  <select
                    value={form.taskCategory}
                    onChange={e => setForm({ ...form, taskCategory: e.target.value as TaskCategory })}
                  >
                    {taskCategories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>
                    Module / Area (Column 4)
                  </span>
                  <select
                    value={form.module}
                    onChange={e => setForm({ ...form, module: e.target.value })}
                  >
                    <option value="">(None / Blank)</option>
                    {modules.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field full">
                  <div className="field-header-row">
                    <label htmlFor="activity-textarea" className="field-label-text">
                      Activity (Column 5: Task / Work description) <b>*</b>
                    </label>
                    <button
                      type="button"
                      className="bullet-toggle-btn"
                      title="Add or toggle bullet points (•)"
                      onClick={toggleBullets}
                    >
                      <List size={13} />
                      <span>Bullet list</span>
                    </button>
                  </div>
                  <textarea
                    id="activity-textarea"
                    ref={activityTextareaRef}
                    autoFocus
                    required
                    rows={4}
                    value={form.activity}
                    onChange={e => setForm({ ...form, activity: e.target.value })}
                    onKeyDown={handleActivityKeyDown}
                    placeholder="e.g. • Across all Data Entry screens, retain selected GL Account Number&#10;• Testing & verification on staging"
                  />
                </div>

                <label className="field">
                  <span>
                    Work Done / Outcome (Column 6: DDL)
                  </span>
                  <select
                    value={form.workDone}
                    onChange={e => setForm({ ...form, workDone: e.target.value as WorkOutcome })}
                  >
                    <option value="">(None / Blank)</option>
                    {outcomeOptions.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Time Spent in hrs (Column 7)</span>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.01"
                    placeholder="e.g. 2.00 (leave blank for plans)"
                    value={form.hours}
                    onChange={e => setForm({ ...form, hours: e.target.value })}
                  />
                  <div className="quick-time-chips">
                    <span className="chips-label">Quick Pick:</span>
                    {[
                      { label: '+15m', val: 0.25 },
                      { label: '+30m', val: 0.5 },
                      { label: '+1h', val: 1.0 },
                      { label: '+2h', val: 2.0 },
                      { label: '+4h', val: 4.0 },
                    ].map(chip => (
                      <button
                        key={chip.label}
                        type="button"
                        className="time-chip-btn"
                        title={`Add ${chip.label} (${chip.val} hr) to time`}
                        onClick={() => {
                          const current = form.hours === '' ? 0 : Number(form.hours);
                          const safe = Number.isFinite(current) ? current : 0;
                          const nextVal = Math.min(24, Number((safe + chip.val).toFixed(2)));
                          setForm({ ...form, hours: nextVal });
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="time-chip-btn clear-chip-btn"
                      title="Clear hours"
                      onClick={() => setForm({ ...form, hours: '' })}
                    >
                      Clear
                    </button>
                  </div>
                  <small>
                    {durationLabel(form.hours)} equivalent
                  </small>
                </label>

                <label className="field">
                  <span>Type (Column 8)</span>
                  <select
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value as WorkType })}
                  >
                    <option value="">(None / Blank)</option>
                    {workTypes.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Ticket / Reference (Column 9)</span>
                  <input
                    list="ticket-history-list"
                    value={form.reference}
                    onChange={e => handleReferenceChange(e.target.value)}
                    placeholder="e.g. PS-1585 - Posting screens Create/Edit"
                  />
                  <datalist id="ticket-history-list">
                    {recentTickets.map(t => (
                      <option key={t.reference} value={t.reference}>
                        {t.module ? `${t.module} · ` : ''}{t.type || 'No type'}
                      </option>
                    ))}
                  </datalist>
                  {recentTickets.length > 0 && !form.reference && (
                    <div className="ticket-quick-chips">
                      <span className="chips-label">Recent:</span>
                      {recentTickets.slice(0, 3).map(t => (
                        <button
                          key={t.reference}
                          type="button"
                          className="chip-btn"
                          title={`Auto-fill module "${t.module || 'None'}" and type "${t.type || 'None'}"`}
                          onClick={() => applyTicketSuggestion(t)}
                        >
                          {t.reference.length > 22 ? `${t.reference.slice(0, 22)}...` : t.reference}
                        </button>
                      ))}
                    </div>
                  )}
                </label>

                <label className="field">
                  <span>
                    Date (Column 2) <b>*</b>
                  </span>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                  />
                  <small>Formats as {formatSheetDate(form.date)} for sheet</small>
                </label>

                <label className="field full">
                  <span>
                    Personal Remarks (App Only · Not copied to company sheet)
                  </span>
                  <textarea
                    rows={2}
                    value={form.appRemarks}
                    onChange={e => setForm({ ...form, appRemarks: e.target.value })}
                    placeholder="Private reminders, personal notes, or internal tracking details..."
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Check size={17} /> {editing ? 'Save changes' : 'Save entry'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <section
            className="modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">YOUR DATA, YOUR CONTROL</div>
                <h2 id="settings-title">Settings & backup</h2>
                <p>Manage company modules and export or restore your work history.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowSettings(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="sheet-sync-banner">
              <ClipboardCopy size={20} />
              <div>
                <strong>Google Sheet Column Order (9 Columns)</strong>
                <p>
                  1. No. | 2. Date ({sheetDateFormat}) | 3. Task | 4. Module / Area | 5. Activity | 6. Work Done / Outcome (DDL) | 7. Time Spent (hrs) | 8. Type | 9. Ticket / Reference / Remarks
                </p>
              </div>
            </div>

            <div className="date-format-setting">
              <label>
                <strong>Date Format for Google Sheet Copy:</strong>
                <select
                  value={sheetDateFormat}
                  onChange={e => setSheetDateFormat(e.target.value as any)}
                >
                  <option value="DD-MMM-YY">DD-MMM-YY (e.g. 24-Oct-26) - Recommended</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-10-24)</option>
                </select>
              </label>
            </div>

            <div className="date-format-setting">
              <label>
                <div>
                  <strong>Next Google Sheet Row Number (No.):</strong>
                  <span style={{ display: 'block', fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                    Auto-advances when you copy tasks to clipboard.
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  className="sheet-row-input"
                  value={startRowNo || ''}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setStartRowNo(1);
                      return;
                    }
                    const val = parseInt(raw, 10);
                    if (Number.isFinite(val) && val >= 1) {
                      setStartRowNo(val);
                    }
                  }}
                  style={{ width: '90px', padding: '5px 8px', fontSize: '12px', fontWeight: 700 }}
                />
              </label>
            </div>

            {/* CLOUD SYNC SECTION */}
            <div className="cloud-sync-card">
              <div className="cloud-sync-header">
                <div className="cloud-sync-title">
                  <Cloud size={20} className="cloud-icon" />
                  <div>
                    <strong>Personal Google Sheet Cloud Backup</strong>
                    <span>Live backup directly into your personal Google Sheet</span>
                  </div>
                </div>
                {cloudSyncUrl && (
                  <button
                    type="button"
                    className="primary-button sync-now-btn"
                    disabled={isSyncing}
                    onClick={() => syncToCloud()}
                  >
                    <CloudUpload size={15} />
                    <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                )}
              </div>

              <div className="cloud-url-row">
                <label htmlFor="cloud-webhook-url">
                  <strong>Google Apps Script Web App URL:</strong>
                </label>
                <div className="cloud-url-input-wrap">
                  <input
                    id="cloud-webhook-url"
                    type="url"
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    value={cloudSyncUrl}
                    onChange={e => setCloudSyncUrl(e.target.value)}
                  />
                  {cloudSyncUrl && (
                    <button
                      type="button"
                      className="secondary-button test-sync-btn"
                      disabled={isSyncing}
                      onClick={() => syncToCloud()}
                      title="Test cloud sync with this URL"
                    >
                      Test
                    </button>
                  )}
                </div>
              </div>

              {cloudSyncUrl ? (
                <div className="cloud-status-row">
                  <div className="sync-status-indicator">
                    <span className="sync-dot live" />
                    <span>
                      {lastSyncedAt ? `Last backed up: ${lastSyncedAt}` : 'Ready to sync (Click Sync Now)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="cloud-restore-link"
                    disabled={isSyncing}
                    onClick={restoreFromCloud}
                  >
                    Restore from cloud
                  </button>
                </div>
              ) : (
                <p className="cloud-tip">
                  Paste your personal Apps Script Web App URL above to enable one-click cloud backup & restore anytime!
                </p>
              )}
            </div>

            <div className="backup-callout">
              <Database size={20} />
              <div>
                <strong>Local Storage Status</strong>
                <p>Data is also saved offline in this browser. Cloud backup updates your personal Google Sheet on demand.</p>
              </div>
            </div>

            <div className="settings-actions">
              <button className="settings-action" onClick={exportJSON}>
                <div className="setting-action-icon">
                  <Download size={19} />
                </div>
                <div>
                  <strong>Backup JSON</strong>
                  <span>All entries (including internal remarks) and module names.</span>
                </div>
                <ChevronRight size={17} />
              </button>
              <button
                className="settings-action"
                onClick={() => importRef.current?.click()}
              >
                <div className="setting-action-icon">
                  <FileUp size={19} />
                </div>
                <div>
                  <strong>Import JSON backup</strong>
                  <span>Merge entries from a previous backup by ID.</span>
                </div>
                <ChevronRight size={17} />
              </button>
              <button className="settings-action" onClick={exportCSV}>
                <div className="setting-action-icon">
                  <FileSpreadsheet size={19} />
                </div>
                <div>
                  <strong>Export visible entries to CSV</strong>
                  <span>9 columns exactly matching your Google Sheet layout.</span>
                </div>
                <ChevronRight size={17} />
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={e => void importJSON(e.target.files?.[0])}
            />

            <div className="module-settings">
              <div className="module-header-row">
                <div>
                  <h3>Company Modules</h3>
                  <p>Pre-populated with your company sheet modules.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button small-btn"
                  onClick={resetToCompanyModules}
                  title="Reset to official company module list"
                >
                  <RefreshCw size={14} /> Reset
                </button>
              </div>

              <div className="module-add">
                <input
                  value={moduleDraft}
                  onChange={e => setModuleDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addModule();
                    }
                  }}
                  placeholder="Add a new custom module name"
                />
                <button className="secondary-button" onClick={addModule} type="button">
                  <Plus size={16} /> Add
                </button>
              </div>
              <div className="module-chips">
                {modules.map(m => (
                  <span key={m}>
                    {m}
                    <button
                      title={`Remove ${m}`}
                      onClick={() => {
                        if (modules.length <= 1) {
                          setNotice('At least one module must remain in the list.');
                          return;
                        }
                        if (
                          window.confirm(
                            `Remove "${m}" from the module list? Existing entries will keep this module.`
                          )
                        ) {
                          setModules(old => old.filter(x => x !== m));
                        }
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* TOAST FEEDBACK */}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
