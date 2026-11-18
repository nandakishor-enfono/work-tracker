import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  CalendarDays,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  List,
  ListPlus,
  Minus,
  PanelRight,
  PanelRightClose,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  StickyNote,
  SunDim,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type { StickyColor, StickyNoteItem } from './App';
import { formatSheetDate } from './App';

const STICKY_POS_KEY = 'my-work-log.sticky-pos.v1';
const STICKY_SIZE_KEY = 'my-work-log.sticky-size.v1';
const STICKY_DOCKED_KEY = 'my-work-log.sticky-docked.v1';
const STICKY_DIM_KEY = 'my-work-log.sticky-dim.v1';
const STICKY_FONT_SIZE_KEY = 'my-work-log.sticky-font-size.v1';
const STICKY_ACTIVE_ID_KEY = 'my-work-log.sticky-active-id.v1';

type NoteScopeFilter = 'all' | 'general' | 'day';
type FontSizeOption = 'sm' | 'md' | 'lg';
type EditorMode = 'live' | 'raw';

export interface StickyNotepadProps {
  notes: StickyNoteItem[];
  setNotes: React.Dispatch<React.SetStateAction<StickyNoteItem[]>>;
  showSticky: boolean;
  setShowSticky: React.Dispatch<React.SetStateAction<boolean>>;
  isMinimized: boolean;
  setIsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  selectedDate: string;
  onJumpToDate: (dateStr: string) => void;
  onOpenNewTask: (prefill: { activity: string; reference?: string }) => void;
  onBatchAddTasks: (
    items: Array<{ activity: string; reference?: string }>,
    mode: 'completed' | 'tomorrow'
  ) => void;
  setNotice: (msg: string) => void;
}

const TODO_LINE_RE = /^(\s*)[-*•]\s+\[([ xX])\]\s?(.*)$/;
const CHECKBOX_PREFIX_RE = /^(\s*)([-*])\s+\[([ xX])\](?:\s(.*))?$/;
const BULLET_PREFIX_RE = /^(\s*)(•|[-*])\s(.*)$/;
const NUMBERED_PREFIX_RE = /^(\s*)(\d+)\.\s(.*)$/;
const SHORTCUT_TODO_RE = /^(\s*)(?:\[\]|-\s*\[\s*\])\s(.*)$/;
const URL_FIND_RE = /https?:\/\/[^\s<>]+/g;

const COLOR_SWATCHES: Record<StickyColor, string> = {
  yellow: '#fde047',
  green: '#86efac',
  blue: '#7dd3fc',
  pink: '#f9a8d4',
  purple: '#d8b4fe',
  dark: '#1e293b',
};

const FONT_SIZE_PX: Record<FontSizeOption, number> = {
  sm: 12,
  md: 13.5,
  lg: 15,
};

const FONT_SIZE_CYCLE: FontSizeOption[] = ['sm', 'md', 'lg'];

type ContentBlock =
  | { type: 'todo'; lineIndex: number; indent: number; checked: boolean; text: string }
  | { type: 'text'; startLine: number; endLine: number; text: string };

function parseContentBlocks(content: string): ContentBlock[] {
  const lines = content.split('\n');
  const blocks: ContentBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(TODO_LINE_RE);
    if (m) {
      blocks.push({
        type: 'todo',
        lineIndex: i,
        indent: m[1].length,
        checked: m[2].toLowerCase() === 'x',
        text: m[3],
      });
      i += 1;
    } else {
      const start = i;
      while (i < lines.length && !TODO_LINE_RE.test(lines[i])) {
        i += 1;
      }
      blocks.push({
        type: 'text',
        startLine: start,
        endLine: i - 1,
        text: lines.slice(start, i).join('\n'),
      });
    }
  }
  return blocks;
}

function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_FIND_RE);
  if (!matches) return [];
  const unique = new Set<string>();
  for (const raw of matches) {
    const clean = raw.replace(/[.,;!?)]+$/, '');
    if (clean) unique.add(clean);
  }
  return Array.from(unique);
}

function formatShortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    const combined = `${u.hostname.replace(/^www\./, '')}${path}`;
    return combined.length > 34 ? `${combined.slice(0, 34)}…` : combined;
  } catch {
    return url.length > 34 ? `${url.slice(0, 34)}…` : url;
  }
}

/**
 * Extracts ticket IDs or GitHub PR/Issue URLs from note text so the Work Entry modal
 * can pre-fill both Activity and Ticket / Reference cleanly.
 */
export function extractTaskAndReference(rawText: string): { activity: string; reference: string } {
  const cleanedRaw = rawText
    .replace(/^(\s*)[-*•]\s+\[[ xX]\]\s?/, '')
    .replace(/^(\s*)(?:[-*•]|\d+\.)\s+/, '')
    .replace(/^\[?\d{1,2}:\d{2}(?:\s?[APMapm]{2})?\]?\s*/, '')
    .trim();

  if (!cleanedRaw) return { activity: '', reference: '' };

  let reference = '';
  let activity = cleanedRaw;

  const ghUrlMatch = activity.match(/https?:\/\/github\.com\/[^\s)]+\/(?:pull|issues)\/\d+/i);
  if (ghUrlMatch) {
    reference = ghUrlMatch[0].replace(/[.,;!?)]+$/, '');
    activity = activity.replace(ghUrlMatch[0], '').trim();
  }

  if (!reference) {
    const keyMatch = activity.match(/\b([A-Z]{2,10}-\d{1,7})\b/);
    if (keyMatch) {
      reference = keyMatch[1];
      activity = activity.replace(new RegExp(`(?:\\(|\\[)?\\b${keyMatch[1]}\\b(?:\\)|\\])?[:\\s-]*`), ' ').trim();
    }
  }

  if (!reference) {
    const hashMatch = activity.match(/(?:^|\s)(#\d{2,7})\b/);
    if (hashMatch) {
      reference = hashMatch[1];
      activity = activity.replace(hashMatch[1], '').trim();
    }
  }

  activity = activity
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/^[:\-–—|\s]+|[:\-–—|\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!activity) {
    activity = cleanedRaw;
  }

  return { activity, reference };
}

function countTodos(content: string): { total: number; done: number } {
  if (!content) return { total: 0, done: 0 };
  const lines = content.split('\n');
  let total = 0;
  let done = 0;
  for (const line of lines) {
    const m = line.match(TODO_LINE_RE);
    if (m) {
      total += 1;
      if (m[2].toLowerCase() === 'x') done += 1;
    }
  }
  return { total, done };
}

function getTodosByState(content: string, done: boolean): Array<{ activity: string; reference: string }> {
  if (!content) return [];
  const results: Array<{ activity: string; reference: string }> = [];
  for (const line of content.split('\n')) {
    const m = line.match(TODO_LINE_RE);
    if (!m) continue;
    const isChecked = m[2].toLowerCase() === 'x';
    if (isChecked !== done) continue;
    const body = m[3].trim();
    if (!body) continue;
    const extracted = extractTaskAndReference(body);
    if (extracted.activity) results.push(extracted);
  }
  return results;
}

function toggleTodoLineAtIndex(content: string, targetLineIdx: number): string {
  const lines = content.split('\n');
  if (targetLineIdx < 0 || targetLineIdx >= lines.length) return content;
  const line = lines[targetLineIdx];
  const m = line.match(TODO_LINE_RE);
  if (!m) return content;
  const indent = m[1];
  const nextMark = m[2].toLowerCase() === 'x' ? ' ' : 'x';
  const body = m[3];
  lines[targetLineIdx] = `${indent}- [${nextMark}] ${body}`;
  return lines.join('\n');
}

function clearCompletedTodoLines(content: string): string {
  const lines = content.split('\n');
  const kept = lines.filter(line => {
    const m = line.match(TODO_LINE_RE);
    return !(m && m[2].toLowerCase() === 'x');
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Moves checked todos to the bottom of each contiguous checklist block so open todos stay front and center.
 */
function moveCompletedTodosDown(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (TODO_LINE_RE.test(lines[i])) {
      const unchecked: string[] = [];
      const checked: string[] = [];
      while (i < lines.length && TODO_LINE_RE.test(lines[i])) {
        const m = lines[i].match(TODO_LINE_RE)!;
        if (m[2].toLowerCase() === 'x') checked.push(lines[i]);
        else unchecked.push(lines[i]);
        i += 1;
      }
      result.push(...unchecked, ...checked);
    } else {
      result.push(lines[i]);
      i += 1;
    }
  }
  return result.join('\n');
}

function getNoteDisplayTitle(note: StickyNoteItem): string {
  const trimmedTitle = (note.title || '').trim();
  if (trimmedTitle) return trimmedTitle;
  const firstLine = (note.content || '')
    .split('\n')
    .map(l => l.replace(/^(\s*)[-*•#]+\s*(\[[ xX]\]\s*)?/, '').trim())
    .find(Boolean);
  if (firstLine) {
    return firstLine.length > 34 ? `${firstLine.slice(0, 34)}…` : firstLine;
  }
  return 'Untitled note';
}

function formatSavedTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9\-_\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return cleaned || 'sticky-note';
}

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  inputRef?: (el: HTMLTextAreaElement | null) => void;
  fontSizePx: number;
  containerWidthKey?: number;
}

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  inputRef,
  fontSizePx,
  containerWidthKey,
  value,
  style,
  ...rest
}) => {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      localRef.current = el;
      if (inputRef) inputRef(el);
    },
    [inputRef]
  );

  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, Math.round(fontSizePx * 1.5))}px`;
  }, [value, fontSizePx, containerWidthKey]);

  return (
    <textarea
      ref={setRefs}
      rows={1}
      value={value}
      style={{ ...style, fontSize: `${fontSizePx}px` }}
      {...rest}
    />
  );
};

export const StickyNotepad: React.FC<StickyNotepadProps> = ({
  notes,
  setNotes,
  showSticky,
  setShowSticky,
  isMinimized,
  setIsMinimized,
  selectedDate,
  onJumpToDate,
  onOpenNewTask,
  onBatchAddTasks,
  setNotice,
}) => {
  const [activeNoteId, setActiveNoteId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STICKY_ACTIVE_ID_KEY);
      if (saved) return saved;
    } catch {
      // storage fallback
    }
    return notes[0]?.id || '';
  });

  const [scopeFilter, setScopeFilter] = useState<NoteScopeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showTaskMenu, setShowTaskMenu] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('live');
  const [copiedSticky, setCopiedSticky] = useState(false);

  const [isDocked, setIsDocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STICKY_DOCKED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [dimUnfocused, setDimUnfocused] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STICKY_DIM_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [fontSize, setFontSize] = useState<FontSizeOption>(() => {
    try {
      const saved = localStorage.getItem(STICKY_FONT_SIZE_KEY);
      if (saved === 'sm' || saved === 'md' || saved === 'lg') return saved;
    } catch {
      // fallback
    }
    return 'md';
  });

  const [stickyPos, setStickyPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem(STICKY_POS_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
      }
    } catch {
      // fallback
    }
    return null;
  });

  const [stickySize, setStickySize] = useState<{ width: number; height: number } | null>(() => {
    try {
      const saved = localStorage.getItem(STICKY_SIZE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (typeof s?.width === 'number' && typeof s?.height === 'number' && s.width >= 260 && s.height >= 220) {
          return s;
        }
      }
    } catch {
      // fallback
    }
    return null;
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);

  // Live block editor refs & deterministic focus restoration
  const blockRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const focusedLineRef = useRef<number>(0);
  const pendingFocusRef = useRef<{ lineIndex: number; pos: 'start' | 'end' | number } | null>(null);

  // Soft Undo state
  const [undoState, setUndoState] = useState<{
    message: string;
    previousNotes: StickyNoteItem[];
    previousActiveId: string;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const pushUndo = useCallback(
    (message: string, previousNotes: StickyNoteItem[], previousActiveId: string) => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      setUndoState({ message, previousNotes, previousActiveId });
      undoTimerRef.current = window.setTimeout(() => {
        setUndoState(null);
        undoTimerRef.current = null;
      }, 8000);
    },
    []
  );

  const handleUndo = () => {
    if (!undoState) return;
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setNotes(undoState.previousNotes);
    setActiveNoteId(undoState.previousActiveId);
    setUndoState(null);
    setNotice('Restored previous note state.');
  };

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Persist preferences
  useEffect(() => {
    try {
      if (activeNoteId) localStorage.setItem(STICKY_ACTIVE_ID_KEY, activeNoteId);
    } catch {
      // storage
    }
  }, [activeNoteId]);

  useEffect(() => {
    try {
      localStorage.setItem(STICKY_DOCKED_KEY, String(isDocked));
    } catch {
      // storage
    }
  }, [isDocked]);

  useEffect(() => {
    try {
      localStorage.setItem(STICKY_DIM_KEY, String(dimUnfocused));
    } catch {
      // storage
    }
  }, [dimUnfocused]);

  useEffect(() => {
    try {
      localStorage.setItem(STICKY_FONT_SIZE_KEY, fontSize);
    } catch {
      // storage
    }
  }, [fontSize]);

  useEffect(() => {
    if (stickyPos) {
      try {
        localStorage.setItem(STICKY_POS_KEY, JSON.stringify(stickyPos));
      } catch {
        // storage
      }
    }
  }, [stickyPos]);

  useEffect(() => {
    if (stickySize) {
      try {
        localStorage.setItem(STICKY_SIZE_KEY, JSON.stringify(stickySize));
      } catch {
        // storage
      }
    }
  }, [stickySize]);

  // Sorted notes: pinned first
  const sortedNotes = useMemo(() => {
    const pinned: StickyNoteItem[] = [];
    const regular: StickyNoteItem[] = [];
    for (const n of notes) {
      if (n.isPinned) pinned.push(n);
      else regular.push(n);
    }
    return [...pinned, ...regular];
  }, [notes]);

  const dayNoteCount = useMemo(
    () => notes.filter(n => n.linkedDate === selectedDate).length,
    [notes, selectedDate]
  );

  const generalNoteCount = useMemo(
    () => notes.filter(n => !n.linkedDate).length,
    [notes]
  );

  const scopedNotes = useMemo(() => {
    if (scopeFilter === 'day') {
      return sortedNotes.filter(n => n.linkedDate === selectedDate);
    }
    if (scopeFilter === 'general') {
      return sortedNotes.filter(n => !n.linkedDate);
    }
    return sortedNotes;
  }, [sortedNotes, scopeFilter, selectedDate]);

  const switcherNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scopedNotes;
    return scopedNotes.filter(n => {
      const title = (n.title || '').toLowerCase();
      const content = (n.content || '').toLowerCase();
      const dateStr = (n.linkedDate || '').toLowerCase();
      return title.includes(q) || content.includes(q) || dateStr.includes(q);
    });
  }, [scopedNotes, searchQuery]);

  useEffect(() => {
    if (scopedNotes.length === 0) return;
    const existsInScope = scopedNotes.some(n => n.id === activeNoteId);
    if (!existsInScope) {
      setActiveNoteId(scopedNotes[0].id);
    }
  }, [scopedNotes, activeNoteId]);

  const activeIndexInScope = useMemo(
    () => scopedNotes.findIndex(n => n.id === activeNoteId),
    [scopedNotes, activeNoteId]
  );

  const activeNote: StickyNoteItem | null =
    activeIndexInScope >= 0 ? scopedNotes[activeIndexInScope] : scopedNotes[0] || null;

  const contentBlocks = useMemo(
    () => parseContentBlocks(activeNote?.content || ''),
    [activeNote?.content]
  );

  const todoStats = useMemo(() => countTodos(activeNote?.content || ''), [activeNote?.content]);
  const todoPercent = todoStats.total > 0 ? Math.round((todoStats.done / todoStats.total) * 100) : 0;

  const wordCount = useMemo(() => {
    const txt = (activeNote?.content || '').trim();
    return txt ? txt.split(/\s+/).length : 0;
  }, [activeNote?.content]);

  // Execute pending focus cleanly after render
  useEffect(() => {
    const req = pendingFocusRef.current;
    if (!req || editorMode !== 'live') return;
    pendingFocusRef.current = null;

    // 1. Check exact todo block
    const todoEl = blockRefs.current.get(`todo-${req.lineIndex}`);
    if (todoEl) {
      todoEl.focus();
      const pos =
        req.pos === 'start'
          ? 0
          : req.pos === 'end'
          ? todoEl.value.length
          : Math.min(req.pos, todoEl.value.length);
      todoEl.setSelectionRange(pos, pos);
      focusedLineRef.current = req.lineIndex;
      return;
    }

    // 2. Check text block containing req.lineIndex
    for (const blk of contentBlocks) {
      if (blk.type === 'text' && req.lineIndex >= blk.startLine && req.lineIndex <= blk.endLine) {
        const textEl = blockRefs.current.get(`text-${blk.startLine}`);
        if (textEl) {
          textEl.focus();
          const subLines = blk.text.split('\n');
          const relLine = req.lineIndex - blk.startLine;
          let offset = 0;
          for (let j = 0; j < relLine; j++) {
            offset += subLines[j].length + 1;
          }
          const lineLen = subLines[relLine]?.length || 0;
          const pos =
            req.pos === 'start'
              ? offset
              : req.pos === 'end'
              ? offset + lineLen
              : offset + Math.min(req.pos, lineLen);
          textEl.setSelectionRange(pos, pos);
          focusedLineRef.current = req.lineIndex;
        }
        return;
      }
    }
  }, [activeNote?.content, contentBlocks, editorMode]);

  const focusActiveEditor = useCallback(() => {
    setTimeout(() => {
      if (editorMode === 'raw') {
        rawTextareaRef.current?.focus();
        return;
      }
      const firstBlock = contentBlocks[0];
      if (!firstBlock) return;
      const key = firstBlock.type === 'todo' ? `todo-${firstBlock.lineIndex}` : `text-${firstBlock.startLine}`;
      blockRefs.current.get(key)?.focus();
    }, 30);
  }, [contentBlocks, editorMode]);

  // Clamp position & size into viewport
  const clampPositionAndSize = useCallback(() => {
    if (isDocked) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setStickySize(prev => {
      if (!prev) return prev;
      const maxW = Math.max(300, Math.floor(vw * 0.92));
      const maxH = Math.max(260, Math.floor(vh * 0.88));
      const nextW = Math.min(Math.max(300, prev.width), maxW);
      const nextH = Math.min(Math.max(260, prev.height), maxH);
      if (nextW !== prev.width || nextH !== prev.height) {
        return { width: nextW, height: nextH };
      }
      return prev;
    });
    setStickyPos(pos => {
      if (!pos) return pos;
      const el = containerRef.current;
      const w = el?.offsetWidth || stickySize?.width || 370;
      const h = el?.offsetHeight || stickySize?.height || 430;
      const maxX = Math.max(10, vw - w - 10);
      const maxY = Math.max(10, vh - h - 10);
      const clampedX = Math.min(Math.max(10, pos.x), maxX);
      const clampedY = Math.min(Math.max(10, pos.y), maxY);
      if (clampedX !== pos.x || clampedY !== pos.y) {
        return { x: clampedX, y: clampedY };
      }
      return pos;
    });
  }, [isDocked, stickySize?.height, stickySize?.width]);

  useEffect(() => {
    window.addEventListener('resize', clampPositionAndSize);
    return () => window.removeEventListener('resize', clampPositionAndSize);
  }, [clampPositionAndSize]);

  useEffect(() => {
    if (!isDocked) clampPositionAndSize();
  }, [isDocked, clampPositionAndSize]);

  // Persist user's manual CSS resize in floating mode
  useEffect(() => {
    if (!showSticky || isMinimized || isDocked) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let saveTimeout: number | null = null;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (w >= 300 && h >= 260) {
          if (saveTimeout) window.clearTimeout(saveTimeout);
          saveTimeout = window.setTimeout(() => {
            setStickySize(prev => {
              if (prev && Math.abs(prev.width - w) < 2 && Math.abs(prev.height - h) < 2) {
                return prev;
              }
              return { width: w, height: h };
            });
          }, 150);
        }
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (saveTimeout) window.clearTimeout(saveTimeout);
    };
  }, [showSticky, isMinimized, isDocked]);

  // Dragging in floating mode
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isDocked) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const el = containerRef.current;
      const w = el?.offsetWidth || 370;
      const h = el?.offsetHeight || 430;
      const maxX = Math.max(10, window.innerWidth - w - 10);
      const maxY = Math.max(10, window.innerHeight - h - 10);
      const newX = Math.min(Math.max(10, e.clientX - dragOffsetRef.current.x), maxX);
      const newY = Math.min(Math.max(10, e.clientY - dragOffsetRef.current.y), maxY);
      setStickyPos({ x: newX, y: newY });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Close internal popovers on outside click
  useEffect(() => {
    if (!showSwitcher && !showTaskMenu) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showSwitcher && switcherRef.current && !switcherRef.current.contains(target)) {
        setShowSwitcher(false);
      }
      if (showTaskMenu && taskMenuRef.current && !taskMenuRef.current.contains(target)) {
        setShowTaskMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showSwitcher, showTaskMenu]);

  // Global keyboard shortcut: Alt + N to open/focus/minimize; Escape closes menus first
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (!showSticky) {
          setShowSticky(true);
          setIsMinimized(false);
          focusActiveEditor();
        } else if (isMinimized) {
          setIsMinimized(false);
          focusActiveEditor();
        } else {
          const activeEl = document.activeElement;
          const isInsideNote = Boolean(containerRef.current && activeEl && containerRef.current.contains(activeEl));
          if (isInsideNote) {
            setIsMinimized(true);
          } else {
            focusActiveEditor();
          }
        }
        return;
      }

      if (e.key === 'Escape' && showSticky && !isMinimized) {
        if (showSwitcher) {
          e.stopImmediatePropagation();
          setShowSwitcher(false);
        } else if (showTaskMenu) {
          e.stopImmediatePropagation();
          setShowTaskMenu(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKey, true);
    return () => window.removeEventListener('keydown', handleGlobalKey, true);
  }, [showSticky, isMinimized, showSwitcher, showTaskMenu, setShowSticky, setIsMinimized, focusActiveEditor]);

  // Note CRUD helpers
  const updateNoteById = useCallback(
    (id: string, patch: Partial<StickyNoteItem>) => {
      setNotes(prev =>
        prev.map(n =>
          n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
        )
      );
    },
    [setNotes]
  );

  const addNewNote = (forceDate?: string) => {
    const linkDate = forceDate !== undefined ? forceDate : scopeFilter === 'day' ? selectedDate : undefined;
    const newNote: StickyNoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: linkDate ? `Notes · ${formatSheetDate(linkDate)}` : '',
      content: '',
      color: activeNote?.color || 'yellow',
      isPinned: false,
      linkedDate: linkDate,
      isMono: activeNote?.isMono || false,
      updatedAt: new Date().toISOString(),
    };
    setNotes(prev => [...prev, newNote]);
    setActiveNoteId(newNote.id);
    setShowSwitcher(false);
    pendingFocusRef.current = { lineIndex: 0, pos: 'start' };
  };

  const deleteNoteById = (id: string) => {
    const target = notes.find(n => n.id === id);
    if (!target) return;

    const prevSnapshot = [...notes];
    const prevId = activeNoteId;

    if (notes.length <= 1) {
      if (!target.content.trim() && !(target.title || '').trim()) {
        setNotice('Note is already empty.');
        return;
      }
      pushUndo('Cleared note.', prevSnapshot, prevId);
      updateNoteById(id, { title: '', content: '', linkedDate: undefined });
      return;
    }

    const remaining = notes.filter(n => n.id !== id);
    pushUndo(`Deleted "${getNoteDisplayTitle(target)}".`, prevSnapshot, prevId);
    setNotes(remaining);

    if (activeNoteId === id) {
      const idxInScope = scopedNotes.findIndex(n => n.id === id);
      const nextScoped = scopedNotes.filter(n => n.id !== id);
      if (nextScoped.length > 0) {
        const nextIdx = Math.min(Math.max(0, idxInScope - 1), nextScoped.length - 1);
        setActiveNoteId(nextScoped[nextIdx].id);
      } else {
        setActiveNoteId(remaining[0].id);
      }
    }
  };

  const togglePinNote = (id: string) => {
    const target = notes.find(n => n.id === id);
    if (!target) return;
    const nextPinned = !target.isPinned;
    updateNoteById(id, { isPinned: nextPinned });
    setNotice(nextPinned ? 'Note pinned to top.' : 'Note unpinned.');
  };

  const toggleLinkDate = () => {
    if (!activeNote) return;
    if (activeNote.linkedDate) {
      updateNoteById(activeNote.id, { linkedDate: undefined });
      if (scopeFilter === 'day') setScopeFilter('all');
      setNotice('Note changed to General (always available).');
    } else {
      updateNoteById(activeNote.id, { linkedDate: selectedDate });
      setNotice(`Note linked to ${formatSheetDate(selectedDate)}.`);
    }
  };

  // --- LIVE CHECKLIST & HYBRID BLOCK OPERATIONS ---

  const addTodoLine = (afterLineIndex?: number, indentSpaces = 0) => {
    if (!activeNote) {
      addNewNote();
      return;
    }
    const content = activeNote.content || '';
    const lines = content.split('\n');
    const prefix = `${' '.repeat(Math.max(0, Math.min(6, indentSpaces)))}- [ ] `;

    if (editorMode === 'raw') {
      insertSnippetRaw('- [ ] ');
      return;
    }

    // If the entire note is currently just one blank line, replace line 0 directly
    if (lines.length === 1 && !lines[0].trim()) {
      updateNoteById(activeNote.id, { content: prefix });
      pendingFocusRef.current = { lineIndex: 0, pos: 'start' };
      return;
    }

    const insertIdx =
      afterLineIndex !== undefined
        ? Math.min(lines.length, Math.max(0, afterLineIndex + 1))
        : lines.length;
    lines.splice(insertIdx, 0, prefix);
    updateNoteById(activeNote.id, { content: lines.join('\n') });
    pendingFocusRef.current = { lineIndex: insertIdx, pos: 'start' };
  };

  const updateTodoText = (lineIndex: number, nextText: string) => {
    if (!activeNote) return;
    const lines = (activeNote.content || '').split('\n');
    const m = lines[lineIndex]?.match(TODO_LINE_RE);
    if (!m) return;
    const indent = m[1];
    const mark = m[2];
    lines[lineIndex] = `${indent}- [${mark}] ${nextText.replace(/\r?\n/g, ' ')}`;
    updateNoteById(activeNote.id, { content: lines.join('\n') });
  };

  const removeLineAt = (lineIndex: number) => {
    if (!activeNote) return;
    const lines = (activeNote.content || '').split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    if (lines.length === 1) {
      updateNoteById(activeNote.id, { content: '' });
      pendingFocusRef.current = { lineIndex: 0, pos: 'start' };
      return;
    }
    lines.splice(lineIndex, 1);
    updateNoteById(activeNote.id, { content: lines.join('\n') });
    pendingFocusRef.current = { lineIndex: Math.max(0, lineIndex - 1), pos: 'end' };
  };

  const handleTodoKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    blk: Extract<ContentBlock, { type: 'todo' }>
  ) => {
    if (!activeNote) return;
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lines = (activeNote.content || '').split('\n');

    // Enter -> add new checkbox below (or convert empty todo to plain line to exit checklist)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (!blk.text.trim()) {
        // Exit checklist cleanly by turning this empty todo into a plain line
        lines[blk.lineIndex] = '';
        updateNoteById(activeNote.id, { content: lines.join('\n') });
        pendingFocusRef.current = { lineIndex: blk.lineIndex, pos: 'start' };
        return;
      }
      const beforeText = blk.text.slice(0, start);
      const afterText = blk.text.slice(end);
      const indentStr = ' '.repeat(blk.indent);
      const mark = blk.checked ? 'x' : ' ';
      lines[blk.lineIndex] = `${indentStr}- [${mark}] ${beforeText}`;
      lines.splice(blk.lineIndex + 1, 0, `${indentStr}- [ ] ${afterText}`);
      updateNoteById(activeNote.id, { content: lines.join('\n') });
      pendingFocusRef.current = { lineIndex: blk.lineIndex + 1, pos: 'start' };
      return;
    }

    // Backspace at cursor 0 -> remove empty todo or convert non-empty todo to plain text
    if (e.key === 'Backspace' && start === 0 && end === 0) {
      e.preventDefault();
      if (!blk.text.trim()) {
        removeLineAt(blk.lineIndex);
      } else {
        lines[blk.lineIndex] = blk.text;
        updateNoteById(activeNote.id, { content: lines.join('\n') });
        pendingFocusRef.current = { lineIndex: blk.lineIndex, pos: 'start' };
      }
      return;
    }

    // Tab / Shift+Tab -> indent / outdent sub-todos (up to 3 levels)
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextIndent = e.shiftKey
        ? Math.max(0, blk.indent - 2)
        : Math.min(6, blk.indent + 2);
      if (nextIndent !== blk.indent) {
        const mark = blk.checked ? 'x' : ' ';
        lines[blk.lineIndex] = `${' '.repeat(nextIndent)}- [${mark}] ${blk.text}`;
        updateNoteById(activeNote.id, { content: lines.join('\n') });
        pendingFocusRef.current = { lineIndex: blk.lineIndex, pos: start };
      }
      return;
    }

    // ArrowUp at start -> previous line
    if (e.key === 'ArrowUp' && start === 0 && end === 0 && blk.lineIndex > 0) {
      e.preventDefault();
      pendingFocusRef.current = { lineIndex: blk.lineIndex - 1, pos: 'end' };
      // Focus immediately if no content change needed
      const prevTodo = blockRefs.current.get(`todo-${blk.lineIndex - 1}`);
      if (prevTodo) {
        pendingFocusRef.current = null;
        prevTodo.focus();
        prevTodo.setSelectionRange(prevTodo.value.length, prevTodo.value.length);
      } else {
        for (const b of contentBlocks) {
          if (b.type === 'text' && blk.lineIndex - 1 >= b.startLine && blk.lineIndex - 1 <= b.endLine) {
            const prevText = blockRefs.current.get(`text-${b.startLine}`);
            if (prevText) {
              pendingFocusRef.current = null;
              prevText.focus();
              prevText.setSelectionRange(prevText.value.length, prevText.value.length);
            }
            break;
          }
        }
      }
      return;
    }

    // ArrowDown at end -> next line
    if (e.key === 'ArrowDown' && start === ta.value.length && end === ta.value.length && blk.lineIndex < lines.length - 1) {
      e.preventDefault();
      const nextIdx = blk.lineIndex + 1;
      const nextTodo = blockRefs.current.get(`todo-${nextIdx}`);
      if (nextTodo) {
        nextTodo.focus();
        nextTodo.setSelectionRange(0, 0);
      } else {
        for (const b of contentBlocks) {
          if (b.type === 'text' && nextIdx >= b.startLine && nextIdx <= b.endLine) {
            const nextText = blockRefs.current.get(`text-${b.startLine}`);
            if (nextText) {
              nextText.focus();
              nextText.setSelectionRange(0, 0);
            }
            break;
          }
        }
      }
    }
  };

  // Multi-line paste inside a todo item splits into individual checkboxes cleanly
  const handleTodoPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    blk: Extract<ContentBlock, { type: 'todo' }>
  ) => {
    if (!activeNote) return;
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted || !/\r?\n/.test(pasted)) return;
    const pastedLines = pasted
      .split(/\r?\n/)
      .map(l => l.replace(/^(\s*)[-*•]\s+(\[[ xX]\]\s?)?/, '').trim())
      .filter(Boolean);
    if (pastedLines.length <= 1) return;

    e.preventDefault();
    const ta = e.currentTarget;
    const before = blk.text.slice(0, ta.selectionStart);
    const after = blk.text.slice(ta.selectionEnd);
    const indentStr = ' '.repeat(blk.indent);
    const mark = blk.checked ? 'x' : ' ';

    const lines = (activeNote.content || '').split('\n');
    const replacement = pastedLines.map((item, idx) => {
      if (idx === 0) return `${indentStr}- [${mark}] ${before}${item}`;
      if (idx === pastedLines.length - 1) return `${indentStr}- [ ] ${item}${after}`;
      return `${indentStr}- [ ] ${item}`;
    });
    lines.splice(blk.lineIndex, 1, ...replacement);
    updateNoteById(activeNote.id, { content: lines.join('\n') });
    pendingFocusRef.current = { lineIndex: blk.lineIndex + replacement.length - 1, pos: 'end' };
  };

  const updateTextBlock = (
    blk: Extract<ContentBlock, { type: 'text' }>,
    nextText: string,
    cursorPos?: number
  ) => {
    if (!activeNote) return;
    const lines = (activeNote.content || '').split('\n');
    const nextSubLines = nextText.split('\n');

    // Auto-convert shortcut: typing "[] " or "- [ ] " at start of a line turns it into a real live checkbox!
    let convertedLineGlobal: number | null = null;
    for (let j = 0; j < nextSubLines.length; j++) {
      const m = nextSubLines[j].match(SHORTCUT_TODO_RE);
      if (m) {
        nextSubLines[j] = `${m[1]}- [ ] ${m[2]}`;
        convertedLineGlobal = blk.startLine + j;
        break;
      }
    }

    const replaceCount = blk.endLine - blk.startLine + 1;
    lines.splice(blk.startLine, replaceCount, ...nextSubLines);
    updateNoteById(activeNote.id, { content: lines.join('\n') });

    if (convertedLineGlobal !== null) {
      pendingFocusRef.current = { lineIndex: convertedLineGlobal, pos: 'end' };
    } else if (cursorPos !== undefined) {
      // Update focusedLineRef accurately
      const upToCursor = nextText.slice(0, cursorPos);
      const relLine = (upToCursor.match(/\n/g) || []).length;
      focusedLineRef.current = blk.startLine + relLine;
    }
  };

  const handleTextBlockKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    blk: Extract<ContentBlock, { type: 'text' }>
  ) => {
    if (!activeNote) return;
    const ta = e.currentTarget;
    const value = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // Tab indentation inside text block
    if (e.key === 'Tab') {
      e.preventDefault();
      if (start === end) {
        if (!e.shiftKey) {
          const next = `${value.slice(0, start)}  ${value.slice(end)}`;
          updateTextBlock(blk, next);
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + 2;
          }, 0);
        } else {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const linePrefix = value.slice(lineStart, lineStart + 2);
          let removed = 0;
          if (linePrefix === '  ') removed = 2;
          else if (linePrefix.startsWith(' ') || linePrefix.startsWith('\t')) removed = 1;
          if (removed > 0) {
            const next = `${value.slice(0, lineStart)}${value.slice(lineStart + removed)}`;
            updateTextBlock(blk, next);
            const nextCursor = Math.max(lineStart, start - removed);
            setTimeout(() => {
              ta.selectionStart = ta.selectionEnd = nextCursor;
            }, 0);
          }
        }
      }
      return;
    }

    // Smart Enter for bullets and numbered lists inside text blocks
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && start === end) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = value.indexOf('\n', start);
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const fullLine = value.slice(lineStart, lineEnd);

      const bulletMatch = fullLine.match(BULLET_PREFIX_RE);
      if (bulletMatch) {
        e.preventDefault();
        const [, indent, bullet, body] = bulletMatch;
        if (!body.trim()) {
          const next = `${value.slice(0, lineStart)}${value.slice(lineEnd)}`;
          updateTextBlock(blk, next);
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          }, 0);
        } else {
          const insertion = `\n${indent}${bullet} `;
          const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
          updateTextBlock(blk, next);
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + insertion.length;
          }, 0);
        }
        return;
      }

      const numMatch = fullLine.match(NUMBERED_PREFIX_RE);
      if (numMatch) {
        e.preventDefault();
        const [, indent, numStr, body] = numMatch;
        if (!body.trim()) {
          const next = `${value.slice(0, lineStart)}${value.slice(lineEnd)}`;
          updateTextBlock(blk, next);
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          }, 0);
        } else {
          const nextNum = parseInt(numStr, 10) + 1;
          const insertion = `\n${indent}${nextNum}. `;
          const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
          updateTextBlock(blk, next);
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + insertion.length;
          }, 0);
        }
        return;
      }
    }

    // ArrowUp at very start of text block -> jump to previous todo
    if (e.key === 'ArrowUp' && start === 0 && end === 0 && blk.startLine > 0) {
      const prevTodo = blockRefs.current.get(`todo-${blk.startLine - 1}`);
      if (prevTodo) {
        e.preventDefault();
        prevTodo.focus();
        prevTodo.setSelectionRange(prevTodo.value.length, prevTodo.value.length);
      }
      return;
    }

    // ArrowDown at very end of text block -> jump to next todo
    if (e.key === 'ArrowDown' && start === value.length && end === value.length) {
      const nextTodo = blockRefs.current.get(`todo-${blk.endLine + 1}`);
      if (nextTodo) {
        e.preventDefault();
        nextTodo.focus();
        nextTodo.setSelectionRange(0, 0);
      }
    }
  };

  // --- RAW MODE SNIPPET & KEYDOWN ---

  const insertSnippetRaw = (snippet: string) => {
    if (!activeNote) {
      addNewNote();
      return;
    }
    const ta = rawTextareaRef.current;
    const current = activeNote.content || '';
    if (!ta) {
      const nextText = current ? `${current}\n${snippet}` : snippet;
      updateNoteById(activeNote.id, { content: nextText });
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = current.substring(0, start);
    const after = current.substring(end);
    const needsNewline = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const nextText = `${before}${needsNewline}${snippet}${after}`;
    updateNoteById(activeNote.id, { content: nextText });
    setTimeout(() => {
      const el = rawTextareaRef.current;
      if (!el) return;
      el.focus();
      const cursor = start + needsNewline.length + snippet.length;
      el.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const insertSnippet = (snippet: string) => {
    if (!activeNote) {
      addNewNote();
      return;
    }
    if (snippet === '- [ ] ') {
      if (editorMode === 'raw') {
        insertSnippetRaw('- [ ] ');
      } else {
        const lines = (activeNote.content || '').split('\n');
        const targetAfter = Math.min(lines.length - 1, Math.max(0, focusedLineRef.current));
        addTodoLine(targetAfter);
      }
      return;
    }

    if (editorMode === 'raw') {
      insertSnippetRaw(snippet);
      return;
    }

    // Live mode bullet or timestamp insertion
    const lines = (activeNote.content || '').split('\n');
    const targetIdx = Math.min(lines.length - 1, Math.max(0, focusedLineRef.current));
    if (lines.length === 1 && !lines[0].trim()) {
      updateNoteById(activeNote.id, { content: snippet });
      pendingFocusRef.current = { lineIndex: 0, pos: 'end' };
      return;
    }
    // If timestamp and focused line is a todo, prepend timestamp into todo body
    const todoMatch = lines[targetIdx]?.match(TODO_LINE_RE);
    if (snippet.startsWith('[') && todoMatch) {
      lines[targetIdx] = `${todoMatch[1]}- [${todoMatch[2]}] ${snippet}${todoMatch[3]}`;
      updateNoteById(activeNote.id, { content: lines.join('\n') });
      pendingFocusRef.current = { lineIndex: targetIdx, pos: snippet.length };
      return;
    }
    lines.splice(targetIdx + 1, 0, snippet);
    updateNoteById(activeNote.id, { content: lines.join('\n') });
    pendingFocusRef.current = { lineIndex: targetIdx + 1, pos: 'end' };
  };

  const handleRawTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeNote) return;
    const ta = e.currentTarget;
    const value = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (start === end) {
        if (!e.shiftKey) {
          const next = `${value.slice(0, start)}  ${value.slice(end)}`;
          updateNoteById(activeNote.id, { content: next });
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + 2;
          }, 0);
        } else {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const linePrefix = value.slice(lineStart, lineStart + 2);
          let removed = 0;
          if (linePrefix === '  ') removed = 2;
          else if (linePrefix.startsWith(' ') || linePrefix.startsWith('\t')) removed = 1;
          if (removed > 0) {
            const next = `${value.slice(0, lineStart)}${value.slice(lineStart + removed)}`;
            updateNoteById(activeNote.id, { content: next });
            const nextCursor = Math.max(lineStart, start - removed);
            setTimeout(() => {
              ta.selectionStart = ta.selectionEnd = nextCursor;
            }, 0);
          }
        }
      } else {
        const blockStart = value.lastIndexOf('\n', start - 1) + 1;
        const selectedBlock = value.slice(blockStart, end);
        const lines = selectedBlock.split('\n');
        let deltaStart = 0;
        let deltaTotal = 0;

        const transformed = lines.map((line, idx) => {
          if (!e.shiftKey) {
            if (idx === 0) deltaStart = 2;
            deltaTotal += 2;
            return `  ${line}`;
          }
          let rem = 0;
          if (line.startsWith('  ')) rem = 2;
          else if (line.startsWith(' ') || line.startsWith('\t')) rem = 1;
          if (idx === 0) deltaStart = -rem;
          deltaTotal -= rem;
          return line.slice(rem);
        });

        const next = `${value.slice(0, blockStart)}${transformed.join('\n')}${value.slice(end)}`;
        updateNoteById(activeNote.id, { content: next });
        setTimeout(() => {
          ta.selectionStart = Math.max(blockStart, start + deltaStart);
          ta.selectionEnd = Math.max(ta.selectionStart, end + deltaTotal);
        }, 0);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && start === end) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = value.indexOf('\n', start);
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const fullLine = value.slice(lineStart, lineEnd);

      const checkMatch = fullLine.match(CHECKBOX_PREFIX_RE);
      if (checkMatch) {
        e.preventDefault();
        const [, indent, marker, , rawBody] = checkMatch;
        const body = rawBody ?? '';
        if (!body.trim()) {
          const next = `${value.slice(0, lineStart)}${value.slice(lineEnd)}`;
          updateNoteById(activeNote.id, { content: next });
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          }, 0);
        } else {
          const insertion = `\n${indent}${marker} [ ] `;
          const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
          updateNoteById(activeNote.id, { content: next });
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + insertion.length;
          }, 0);
        }
        return;
      }

      const bulletMatch = fullLine.match(BULLET_PREFIX_RE);
      if (bulletMatch) {
        e.preventDefault();
        const [, indent, bullet, body] = bulletMatch;
        if (!body.trim()) {
          const next = `${value.slice(0, lineStart)}${value.slice(lineEnd)}`;
          updateNoteById(activeNote.id, { content: next });
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          }, 0);
        } else {
          const insertion = `\n${indent}${bullet} `;
          const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
          updateNoteById(activeNote.id, { content: next });
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + insertion.length;
          }, 0);
        }
        return;
      }

      const numMatch = fullLine.match(NUMBERED_PREFIX_RE);
      if (numMatch) {
        e.preventDefault();
        const [, indent, numStr, body] = numMatch;
        if (!body.trim()) {
          const next = `${value.slice(0, lineStart)}${value.slice(lineEnd)}`;
          updateNoteById(activeNote.id, { content: next });
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          }, 0);
        } else {
          const nextNum = parseInt(numStr, 10) + 1;
          const insertion = `\n${indent}${nextNum}. `;
          const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
          updateNoteById(activeNote.id, { content: next });
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = start + insertion.length;
          }, 0);
        }
      }
    }
  };

  const handleCopyNote = async () => {
    if (!activeNote) return;
    const textParts: string[] = [];
    if (activeNote.title?.trim()) textParts.push(activeNote.title.trim());
    if (activeNote.content?.trim()) textParts.push(activeNote.content);
    const fullText = textParts.join('\n\n');
    if (!fullText.trim()) {
      setNotice('Note is empty.');
      return;
    }
    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedSticky(true);
      window.setTimeout(() => setCopiedSticky(false), 1800);
      setNotice('Note copied to clipboard!');
    } catch {
      setNotice('Failed to copy note.');
    }
  };

  const handleExportMarkdown = () => {
    if (!activeNote) return;
    const title = (activeNote.title || '').trim();
    const content = activeNote.content || '';
    if (!title && !content.trim()) {
      setNotice('Note is empty.');
      return;
    }
    const md = title ? `# ${title}\n\n${content}` : content;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(getNoteDisplayTitle(activeNote))}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Exported note as Markdown (.md).');
  };

  const handleClearCompleted = () => {
    if (!activeNote || todoStats.done === 0) return;
    pushUndo(`Cleared ${todoStats.done} completed todo(s).`, [...notes], activeNote.id);
    updateNoteById(activeNote.id, { content: clearCompletedTodoLines(activeNote.content) });
  };

  const handleMoveCompletedDown = () => {
    if (!activeNote || todoStats.done === 0 || todoStats.done === todoStats.total) return;
    const sorted = moveCompletedTodosDown(activeNote.content);
    if (sorted !== activeNote.content) {
      updateNoteById(activeNote.id, { content: sorted });
      setNotice('Moved completed todos to bottom.');
    }
  };

  const handleSendSingleTask = () => {
    if (!activeNote) {
      setNotice('Create a note first.');
      return;
    }
    let selectedText = '';
    const activeEl = document.activeElement;
    if (
      activeEl instanceof HTMLTextAreaElement &&
      containerRef.current?.contains(activeEl) &&
      activeEl.selectionStart !== activeEl.selectionEnd
    ) {
      selectedText = activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd).trim();
    }
    if (!selectedText) {
      const lines = (activeNote.content || '').split('\n');
      const focusedLine = lines[focusedLineRef.current]?.trim();
      const firstLine = lines.map(l => l.trim()).find(Boolean);
      selectedText = focusedLine || firstLine || (activeNote.title || '').trim();
    }
    if (!selectedText) {
      setNotice('Write something in the note first!');
      return;
    }
    const extracted = extractTaskAndReference(selectedText);
    setShowTaskMenu(false);
    onOpenNewTask(extracted);
  };

  const handleBatchConvert = (mode: 'completed' | 'tomorrow') => {
    if (!activeNote) return;
    const items = getTodosByState(activeNote.content || '', mode === 'completed');
    setShowTaskMenu(false);
    if (items.length === 0) {
      setNotice(
        mode === 'completed'
          ? 'No checked todos found in this note.'
          : 'No unchecked todos found in this note.'
      );
      return;
    }
    onBatchAddTasks(items, mode);
  };

  const cycleFontSize = () => {
    const idx = FONT_SIZE_CYCLE.indexOf(fontSize);
    setFontSize(FONT_SIZE_CYCLE[(idx + 1) % FONT_SIZE_CYCLE.length]);
  };

  if (!showSticky) return null;

  if (isMinimized) {
    return (
      <button
        type="button"
        className="sticky-minimized-pill"
        onClick={() => setIsMinimized(false)}
        title="Open notepad (Alt+N)"
      >
        <StickyNote size={15} />
        <span>Notes ({notes.length})</span>
        {todoStats.total > 0 && (
          <span className="sticky-pill-counter">
            {todoStats.done}/{todoStats.total}
          </span>
        )}
      </button>
    );
  }

  const floatingStyle: React.CSSProperties = isDocked
    ? {}
    : {
        ...(stickyPos
          ? { position: 'fixed', left: stickyPos.x, top: stickyPos.y, bottom: 'auto', right: 'auto' }
          : {}),
        ...(stickySize ? { width: stickySize.width, height: stickySize.height } : {}),
      };

  const noteThemeClass = `sticky-theme-${activeNote?.color || 'yellow'}`;
  const currentFontPx = FONT_SIZE_PX[fontSize];
  const widthKey = isDocked ? 420 : stickySize?.width || 370;

  return (
    <div
      id="floating-sticky-note"
      ref={containerRef}
      className={`floating-sticky-note ${noteThemeClass} ${isDocked ? 'is-docked' : ''} ${
        dimUnfocused && !isDocked ? 'is-dim-unfocused' : ''
      } ${isDragging ? 'is-dragging-note' : ''}`}
      style={floatingStyle}
    >
      {/* HEADER / DRAG HANDLE */}
      <div className="sticky-header" onMouseDown={handleHeaderMouseDown}>
        <div className="sticky-header-left">
          <div className="sticky-switcher-anchor" ref={switcherRef}>
            <button
              type="button"
              className={`sticky-switcher-trigger ${showSwitcher ? 'is-open' : ''}`}
              onClick={() => setShowSwitcher(prev => !prev)}
              title="Switch, search, or filter notes"
            >
              <StickyNote size={13} />
              <span className="sticky-page-indicator">
                {scopedNotes.length > 0 ? `${Math.max(1, activeIndexInScope + 1)} / ${scopedNotes.length}` : '0 / 0'}
              </span>
              <ChevronDown size={12} />
            </button>

            {showSwitcher && (
              <div className="sticky-switcher-popover">
                <div className="sticky-switcher-search">
                  <Search size={13} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search notes..."
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="sticky-search-clear"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="sticky-scope-tabs">
                  <button
                    type="button"
                    className={`sticky-scope-tab ${scopeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setScopeFilter('all')}
                  >
                    All ({notes.length})
                  </button>
                  <button
                    type="button"
                    className={`sticky-scope-tab ${scopeFilter === 'general' ? 'active' : ''}`}
                    onClick={() => setScopeFilter('general')}
                  >
                    General ({generalNoteCount})
                  </button>
                  <button
                    type="button"
                    className={`sticky-scope-tab ${scopeFilter === 'day' ? 'active' : ''}`}
                    onClick={() => setScopeFilter('day')}
                    title={`Notes linked to ${formatSheetDate(selectedDate)}`}
                  >
                    {formatSheetDate(selectedDate)} ({dayNoteCount})
                  </button>
                </div>

                <div className="sticky-switcher-list">
                  {switcherNotes.length === 0 ? (
                    <div className="sticky-switcher-empty">
                      <span>No matching notes</span>
                      <button
                        type="button"
                        className="sticky-pill-btn"
                        onClick={() => addNewNote(scopeFilter === 'day' ? selectedDate : undefined)}
                      >
                        <Plus size={11} /> Create note
                      </button>
                    </div>
                  ) : (
                    switcherNotes.map(note => {
                      const isCurrent = activeNote?.id === note.id;
                      const noteTodos = countTodos(note.content);
                      return (
                        <div
                          key={note.id}
                          className={`sticky-switcher-item ${isCurrent ? 'active' : ''}`}
                          onClick={() => {
                            setActiveNoteId(note.id);
                            setShowSwitcher(false);
                          }}
                        >
                          <span
                            className="sticky-switcher-dot"
                            style={{ background: COLOR_SWATCHES[note.color] || COLOR_SWATCHES.yellow }}
                          />
                          <div className="sticky-switcher-meta">
                            <div className="sticky-switcher-title-row">
                              {note.isPinned && <Pin size={10} className="sticky-pin-mini" />}
                              <span className="sticky-switcher-title">{getNoteDisplayTitle(note)}</span>
                            </div>
                            <div className="sticky-switcher-sub">
                              {note.linkedDate ? (
                                <span className="sticky-switcher-date">{formatSheetDate(note.linkedDate)}</span>
                              ) : (
                                <span>General</span>
                              )}
                              {noteTodos.total > 0 && (
                                <span>
                                  · {noteTodos.done}/{noteTodos.total} done
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="sticky-switcher-item-actions" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`sticky-mini-action ${note.isPinned ? 'is-pinned' : ''}`}
                              title={note.isPinned ? 'Unpin note' : 'Pin note to top'}
                              onClick={() => togglePinNote(note.id)}
                            >
                              {note.isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                            </button>
                            <button
                              type="button"
                              className="sticky-mini-action danger"
                              title="Delete note"
                              onClick={() => deleteNoteById(note.id)}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="sticky-switcher-footer">
                  <button
                    type="button"
                    className="sticky-switcher-add-btn"
                    onClick={() => addNewNote(scopeFilter === 'day' ? selectedDate : undefined)}
                  >
                    <Plus size={12} />
                    <span>
                      {scopeFilter === 'day'
                        ? `New note for ${formatSheetDate(selectedDate)}`
                        : 'New sticky note'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="sticky-icon-btn"
            title="Previous note"
            onClick={() => {
              if (activeIndexInScope > 0) setActiveNoteId(scopedNotes[activeIndexInScope - 1].id);
            }}
            disabled={activeIndexInScope <= 0}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            className="sticky-icon-btn"
            title="Next note"
            onClick={() => {
              if (activeIndexInScope >= 0 && activeIndexInScope < scopedNotes.length - 1) {
                setActiveNoteId(scopedNotes[activeIndexInScope + 1].id);
              }
            }}
            disabled={activeIndexInScope < 0 || activeIndexInScope >= scopedNotes.length - 1}
          >
            <ChevronRight size={13} />
          </button>
          <button
            type="button"
            className="sticky-icon-btn"
            title="New note"
            onClick={() => addNewNote()}
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="sticky-header-right">
          {activeNote && (
            <button
              type="button"
              className={`sticky-icon-btn ${activeNote.isPinned ? 'is-active-icon' : ''}`}
              title={activeNote.isPinned ? 'Unpin note' : 'Pin note to top'}
              onClick={() => togglePinNote(activeNote.id)}
            >
              {activeNote.isPinned ? <Pin size={13} /> : <PinOff size={13} />}
            </button>
          )}
          {!isDocked && (
            <button
              type="button"
              className={`sticky-icon-btn ${dimUnfocused ? 'is-active-icon' : ''}`}
              title={dimUnfocused ? 'Keep full opacity when unfocused' : 'Dim slightly when unfocused'}
              onClick={() => setDimUnfocused(prev => !prev)}
            >
              <SunDim size={14} />
            </button>
          )}
          <button
            type="button"
            className={`sticky-icon-btn ${isDocked ? 'is-active-icon' : ''}`}
            title={isDocked ? 'Switch to floating sticky note' : 'Dock as right side panel'}
            onClick={() => setIsDocked(prev => !prev)}
          >
            {isDocked ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
          </button>
          <button
            type="button"
            className="sticky-icon-btn"
            title="Copy note"
            onClick={handleCopyNote}
          >
            {copiedSticky ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            className="sticky-icon-btn"
            title="Minimize (Alt+N)"
            onClick={() => setIsMinimized(true)}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="sticky-icon-btn"
            title="Close notepad"
            onClick={() => setShowSticky(false)}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* UNDO BANNER */}
      {undoState && (
        <div className="sticky-undo-bar">
          <span>{undoState.message}</span>
          <button type="button" className="sticky-undo-btn" onClick={handleUndo}>
            <RotateCcw size={11} /> Undo
          </button>
        </div>
      )}

      {/* ACTIVE NOTE OR EMPTY STATE */}
      {!activeNote ? (
        <div className="sticky-empty-scope">
          <CalendarDays size={24} className="sticky-empty-icon" />
          <strong>No notes for {formatSheetDate(selectedDate)}</strong>
          <p>Create a date-linked scratchpad for this day or view all notes.</p>
          <div className="sticky-empty-actions">
            <button
              type="button"
              className="sticky-pill-btn sticky-pill-primary"
              onClick={() => addNewNote(selectedDate)}
            >
              <Plus size={12} /> Create note for {formatSheetDate(selectedDate)}
            </button>
            <button
              type="button"
              className="sticky-pill-btn"
              onClick={() => setScopeFilter('all')}
            >
              Show All Notes ({notes.length})
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* TITLE + DATE LINK ROW */}
          <div className="sticky-title-bar">
            <input
              type="text"
              className="sticky-title-input"
              value={activeNote.title || ''}
              onChange={e => updateNoteById(activeNote.id, { title: e.target.value })}
              placeholder="Note title (optional)..."
              maxLength={80}
            />
            <button
              type="button"
              className={`sticky-date-chip ${activeNote.linkedDate ? 'is-linked' : ''}`}
              onClick={toggleLinkDate}
              title={
                activeNote.linkedDate
                  ? `Linked to ${formatSheetDate(activeNote.linkedDate)}. Click to make General (global).`
                  : `General note. Click to link to selected date (${formatSheetDate(selectedDate)}).`
              }
            >
              {activeNote.linkedDate ? (
                <>
                  <CalendarDays size={10} />
                  <span>{formatSheetDate(activeNote.linkedDate)}</span>
                </>
              ) : (
                <>
                  <Globe size={10} />
                  <span>General</span>
                </>
              )}
            </button>
            {activeNote.linkedDate && activeNote.linkedDate !== selectedDate && (
              <button
                type="button"
                className="sticky-jump-date-btn"
                onClick={() => onJumpToDate(activeNote.linkedDate!)}
                title={`Jump main work log to ${formatSheetDate(activeNote.linkedDate)}`}
              >
                Go
              </button>
            )}
          </div>

          {/* TOOLBAR STRIP */}
          <div className="sticky-quick-strip">
            <div className="sticky-color-dots">
              {(['yellow', 'green', 'blue', 'pink', 'purple', 'dark'] as StickyColor[]).map(c => (
                <button
                  key={c}
                  type="button"
                  className={`sticky-color-dot ${activeNote.color === c ? 'active' : ''}`}
                  style={{ background: COLOR_SWATCHES[c] }}
                  title={`${c} theme`}
                  onClick={() => updateNoteById(activeNote.id, { color: c })}
                />
              ))}
            </div>

            <div className="sticky-strip-sep" />

            <button
              type="button"
              className="sticky-pill-btn sticky-add-todo-pill"
              title="Add a live clickable checkbox todo (or type [] + space)"
              onClick={() => insertSnippet('- [ ] ')}
            >
              <CheckSquare size={11} /> Todo
            </button>
            <button
              type="button"
              className="sticky-pill-btn"
              title="Insert bullet point"
              onClick={() => insertSnippet('• ')}
            >
              <List size={11} />
            </button>
            <button
              type="button"
              className="sticky-pill-btn"
              title="Insert current timestamp"
              onClick={() => {
                const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                insertSnippet(`[${t}] `);
              }}
            >
              <Clock3 size={11} />
            </button>

            <button
              type="button"
              className={`sticky-pill-btn ${activeNote.isMono ? 'is-active-pill' : ''}`}
              title={activeNote.isMono ? 'Switch to standard font' : 'Toggle monospace code font'}
              onClick={() => updateNoteById(activeNote.id, { isMono: !activeNote.isMono })}
            >
              <Code size={11} />
            </button>

            <button
              type="button"
              className="sticky-pill-btn"
              title={`Font size: ${fontSize.toUpperCase()} (click to cycle)`}
              onClick={cycleFontSize}
            >
              <Type size={11} />
            </button>

            <button
              type="button"
              className={`sticky-pill-btn ${editorMode === 'raw' ? 'is-active-pill' : ''}`}
              title={
                editorMode === 'live'
                  ? 'Switch to plain raw Markdown text editor'
                  : 'Switch back to Live Interactive Checkboxes'
              }
              onClick={() => setEditorMode(m => (m === 'live' ? 'raw' : 'live'))}
            >
              <FileText size={11} /> {editorMode === 'raw' ? 'Live' : 'Raw'}
            </button>

            {/* WORK TRACKER INTEGRATION MENU */}
            <div className="sticky-task-menu-wrap" ref={taskMenuRef}>
              <button
                type="button"
                className={`sticky-pill-btn sticky-task-trigger ${showTaskMenu ? 'is-active-pill' : ''}`}
                title="Send note or todos to Work Log (auto-extracts ticket IDs)"
                onClick={() => setShowTaskMenu(prev => !prev)}
              >
                <ListPlus size={11} /> Task <ChevronDown size={10} />
              </button>

              {showTaskMenu && (
                <div className="sticky-task-dropdown">
                  <button
                    type="button"
                    className="sticky-task-option"
                    onClick={handleSendSingleTask}
                  >
                    <Sparkles size={12} />
                    <div>
                      <strong>Selection / current line → New Entry</strong>
                      <span>Auto-extracts #ticket / PR link</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="sticky-task-option"
                    disabled={todoStats.done === 0}
                    onClick={() => handleBatchConvert('completed')}
                  >
                    <CheckCheck size={12} />
                    <div>
                      <strong>Checked todos ({todoStats.done}) → Completed</strong>
                      <span>Logs as &ldquo;A Completed&rdquo; on {formatSheetDate(selectedDate)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="sticky-task-option"
                    disabled={todoStats.total - todoStats.done === 0}
                    onClick={() => handleBatchConvert('tomorrow')}
                  >
                    <ListPlus size={12} />
                    <div>
                      <strong>Unchecked todos ({todoStats.total - todoStats.done}) → Plan</strong>
                      <span>Logs as &ldquo;B Tomorrow&apos;s Plan&rdquo;</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="sticky-icon-btn"
              onClick={() => deleteNoteById(activeNote.id)}
              title="Delete note (with Undo)"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* LIVE TODO PROGRESS BAR (SHOWN WHEN NOTE HAS CHECKBOXES) */}
          {todoStats.total > 0 && (
            <div className="sticky-todo-progress-bar">
              <div className="sticky-todo-progress-info">
                <span className="sticky-todo-progress-label">
                  {todoStats.done === todoStats.total ? (
                    <>🎉 All {todoStats.total} done!</>
                  ) : (
                    <>
                      <strong>{todoStats.done}</strong> of {todoStats.total} done ({todoPercent}%)
                    </>
                  )}
                </span>
                <div className="sticky-todo-progress-actions">
                  {todoStats.done > 0 && todoStats.done < todoStats.total && (
                    <button
                      type="button"
                      className="sticky-progress-action-btn"
                      onClick={handleMoveCompletedDown}
                      title="Move checked items to bottom of list"
                    >
                      <ArrowDownWideNarrow size={11} /> Sort done
                    </button>
                  )}
                  {todoStats.done > 0 && (
                    <button
                      type="button"
                      className="sticky-progress-action-btn danger"
                      onClick={handleClearCompleted}
                      title={`Remove ${todoStats.done} completed todo(s)`}
                    >
                      <CheckCheck size={11} /> Clear done
                    </button>
                  )}
                </div>
              </div>
              <div className="sticky-todo-track">
                <div
                  className={`sticky-todo-fill ${todoStats.done === todoStats.total ? 'is-complete' : ''}`}
                  style={{ width: `${todoPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* MAIN CONTENT: LIVE HYBRID EDITOR OR RAW TEXTAREA */}
          <div className="sticky-content">
            {editorMode === 'raw' ? (
              <textarea
                ref={rawTextareaRef}
                className={`sticky-textarea ${activeNote.isMono ? 'is-mono' : ''}`}
                style={{ fontSize: `${currentFontPx}px` }}
                value={activeNote.content || ''}
                onChange={e => updateNoteById(activeNote.id, { content: e.target.value })}
                onKeyDown={handleRawTextareaKeyDown}
                placeholder="Raw Markdown notes, links, code, or - [ ] todos..."
                autoFocus
              />
            ) : (
              <div
                className={`sticky-live-editor ${activeNote.isMono ? 'is-mono' : ''}`}
                onClick={e => {
                  // Clicking blank space below blocks focuses the last block cleanly
                  if (e.target === e.currentTarget && contentBlocks.length > 0) {
                    const last = contentBlocks[contentBlocks.length - 1];
                    const key = last.type === 'todo' ? `todo-${last.lineIndex}` : `text-${last.startLine}`;
                    const el = blockRefs.current.get(key);
                    if (el) {
                      el.focus();
                      el.setSelectionRange(el.value.length, el.value.length);
                    }
                  }
                }}
              >
                {contentBlocks.map((blk, blkIdx) => {
                  if (blk.type === 'todo') {
                    const urls = extractUrlsFromText(blk.text);
                    const nestLevel = Math.min(3, Math.floor(blk.indent / 2));
                    const isLastTodoInRun =
                      blkIdx === contentBlocks.length - 1 || contentBlocks[blkIdx + 1].type !== 'todo';

                    return (
                      <React.Fragment key={`todo-${blk.lineIndex}`}>
                        <div
                          className={`sticky-live-todo-row ${blk.checked ? 'is-checked' : ''}`}
                          style={{ paddingLeft: `${nestLevel * 18}px` }}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={blk.checked}
                            className={`sticky-custom-checkbox ${blk.checked ? 'checked' : ''}`}
                            onClick={() =>
                              updateNoteById(activeNote.id, {
                                content: toggleTodoLineAtIndex(activeNote.content, blk.lineIndex),
                              })
                            }
                            title={blk.checked ? 'Mark as not done' : 'Mark as done'}
                          >
                            {blk.checked && <Check size={12} strokeWidth={3} />}
                          </button>

                          <div className="sticky-live-todo-body">
                            <AutoResizeTextarea
                              inputRef={el => {
                                const k = `todo-${blk.lineIndex}`;
                                if (el) blockRefs.current.set(k, el);
                                else blockRefs.current.delete(k);
                              }}
                              fontSizePx={currentFontPx}
                              containerWidthKey={widthKey}
                              className={`sticky-live-todo-input ${activeNote.isMono ? 'is-mono' : ''}`}
                              value={blk.text}
                              placeholder="Todo item... (Enter for next, Tab to indent)"
                              onFocus={() => {
                                focusedLineRef.current = blk.lineIndex;
                              }}
                              onChange={e => updateTodoText(blk.lineIndex, e.target.value)}
                              onKeyDown={e => handleTodoKeyDown(e, blk)}
                              onPaste={e => handleTodoPaste(e, blk)}
                            />
                            {urls.length > 0 && (
                              <div className="sticky-inline-links-row">
                                {urls.map(u => (
                                  <a
                                    key={u}
                                    href={u}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="sticky-url-chip"
                                    title={`Open ${u}`}
                                  >
                                    <ExternalLink size={10} />
                                    <span>{formatShortUrl(u)}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="sticky-todo-row-actions">
                            {blk.text.trim() && (
                              <button
                                type="button"
                                className="sticky-todo-mini-btn"
                                title="Log this todo as a Work Entry"
                                onClick={() => onOpenNewTask(extractTaskAndReference(blk.text))}
                              >
                                <ListPlus size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="sticky-todo-mini-btn danger"
                              title="Remove todo"
                              onClick={() => removeLineAt(blk.lineIndex)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>

                        {isLastTodoInRun && (
                          <button
                            type="button"
                            className="sticky-inline-add-todo"
                            onClick={() => addTodoLine(blk.lineIndex, blk.indent)}
                            title="Add another checkbox item"
                          >
                            <Plus size={12} />
                            <span>Add todo</span>
                          </button>
                        )}
                      </React.Fragment>
                    );
                  }

                  // Regular Text Block (consecutive non-todo lines)
                  const blockUrls = extractUrlsFromText(blk.text);
                  const isOnlyEmptyBlock = contentBlocks.length === 1 && !blk.text;
                  return (
                    <div key={`text-${blk.startLine}`} className="sticky-live-text-block">
                      <AutoResizeTextarea
                        inputRef={el => {
                          const k = `text-${blk.startLine}`;
                          if (el) blockRefs.current.set(k, el);
                          else blockRefs.current.delete(k);
                        }}
                        fontSizePx={currentFontPx}
                        containerWidthKey={widthKey}
                        className={`sticky-live-text-input ${activeNote.isMono ? 'is-mono' : ''}`}
                        value={blk.text}
                        placeholder={
                          isOnlyEmptyBlock
                            ? 'Write notes, paste links, or type [] + space for a checkbox...'
                            : 'Add note...'
                        }
                        onFocus={e => {
                          const upToCursor = e.currentTarget.value.slice(0, e.currentTarget.selectionStart);
                          focusedLineRef.current = blk.startLine + (upToCursor.match(/\n/g) || []).length;
                        }}
                        onClick={e => {
                          const upToCursor = e.currentTarget.value.slice(0, e.currentTarget.selectionStart);
                          focusedLineRef.current = blk.startLine + (upToCursor.match(/\n/g) || []).length;
                        }}
                        onChange={e => updateTextBlock(blk, e.target.value, e.target.selectionStart)}
                        onKeyDown={e => handleTextBlockKeyDown(e, blk)}
                      />
                      {blockUrls.length > 0 && (
                        <div className="sticky-inline-links-row">
                          {blockUrls.map(u => (
                            <a
                              key={u}
                              href={u}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sticky-url-chip"
                              title={`Open ${u}`}
                            >
                              <ExternalLink size={10} />
                              <span>{formatShortUrl(u)}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* STATUS FOOTER */}
          <div className="sticky-footer">
            <div className="sticky-footer-left">
              {todoStats.total > 0 && (
                <span className="sticky-footer-todo-pill" title="Completed / Total todos">
                  <CheckSquare size={10} />
                  {todoStats.done}/{todoStats.total}
                </span>
              )}
              <span>
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </span>
              {activeNote.updatedAt && (
                <span className="sticky-footer-saved">· Saved {formatSavedTime(activeNote.updatedAt)}</span>
              )}
            </div>
            <div className="sticky-footer-right">
              <span className="sticky-shortcut-hint" title="Global shortcut to toggle notepad">
                Alt+N
              </span>
              <button
                type="button"
                className="sticky-footer-btn"
                onClick={handleExportMarkdown}
                title="Download note as Markdown (.md)"
              >
                <Download size={11} /> .md
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
