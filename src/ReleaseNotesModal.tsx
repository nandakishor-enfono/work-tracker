import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  GitPullRequest, Tag, CalendarDays, ChevronLeft, ChevronRight,
  Copy, Check, Download, X, RefreshCw, Eye, Edit3, Columns,
  Sparkles, Clock3, Package,
  Code, CheckCircle2, ChevronDown, ListFilter, AlertCircle,
  Users
} from 'lucide-react';
import type { WorkEntry } from './App';
import { formatSheetDate, prettyDate, monthLabel, todayISO } from './App';

export type ReleaseTimeframe = 'day' | 'week' | 'month' | 'custom' | 'all';
export type ReleaseFormatStyle = 'subfeature-grouped' | 'clean-bullets' | 'clean-plain' | 'github-changelog';

export interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: WorkEntry[];
  modules: string[];
  currentDate: string;
  setNotice: (msg: string) => void;
}

export const MODULE_EMOJIS: Record<string, string> = {
  'Administration': '⚙️',
  'Shipping': '📦',
  'General Ledger': '📊',
  'Inventory': '🏬',
  'HR/Payroll': '👥',
  'Fixed Assets': '🏢',
  'Training Management': '🎓',
  'Vendor & Account Payable': '💳',
  'CRM+Lead Mgmt': '💼',
};

export const getModuleEmoji = (moduleName: string) => {
  if (!moduleName) return '📌';
  return MODULE_EMOJIS[moduleName] || '📁';
};

export const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

export const addDaysISO = (dateStr: string, days: number): string => {
  const safeStr = dateStr && typeof dateStr === 'string' ? dateStr.slice(0, 10) : todayISO();
  const d = new Date(`${safeStr}T12:00:00`);
  if (isNaN(d.getTime())) return todayISO();
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
};

export const addMonthsISO = (monthStr: string, months: number): string => {
  const safeStr = monthStr && typeof monthStr === 'string' ? monthStr.slice(0, 7) : todayISO().slice(0, 7);
  const [y, m] = safeStr.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return todayISO().slice(0, 7);
  const d = new Date(y, m - 1 + months, 15);
  const yOut = d.getFullYear();
  const mOut = String(d.getMonth() + 1).padStart(2, '0');
  return `${yOut}-${mOut}`;
};

export const getWeekRange = (dateStr: string) => {
  const safeStr = dateStr && typeof dateStr === 'string' ? dateStr.slice(0, 10) : todayISO();
  const d = new Date(`${safeStr}T12:00:00`);
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const day = validDate.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(validDate);
  mon.setDate(validDate.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const dateCopy = new Date(Date.UTC(validDate.getFullYear(), validDate.getMonth(), validDate.getDate()));
  const dayNum = dateCopy.getUTCDay() || 7;
  dateCopy.setUTCDate(dateCopy.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dateCopy.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((dateCopy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return {
    start: formatLocalDate(mon),
    end: formatLocalDate(sun),
    weekNum,
  };
};

export const isMeetingTask = (task: WorkEntry) => {
  if (task.type === 'Meeting / Discussion') return true;
  const act = (task.activity || '').toLowerCase();
  return /\b(meeting|discussion|standup|sync|call|catchup|sync-up|daily sync)\b/i.test(act);
};

interface ParsedTaskItem {
  subfeature: string;
  description: string;
}

export const parseTaskItem = (task: WorkEntry): ParsedTaskItem => {
  const act = (task.activity || '').trim();
  const remarks = (task.appRemarks || '').trim();

  // Case 1: "Subfeature / Screen: Description"
  if (act.includes(':')) {
    const colonIdx = act.indexOf(':');
    const sub = act.slice(0, colonIdx).trim();
    const desc = act.slice(colonIdx + 1).trim();
    if (desc) {
      return { subfeature: sub, description: desc };
    }
  }

  // Case 2: activity is the screen/subfeature name and remarks has description
  if (remarks) {
    return { subfeature: act, description: remarks };
  }

  // Case 3: Direct item under module
  return { subfeature: '', description: act };
};

export function ReleaseNotesModal({
  isOpen,
  onClose,
  entries,
  modules,
  currentDate,
  setNotice,
}: ReleaseNotesModalProps) {
  // Timeframe and date states
  const [timeframe, setTimeframe] = useState<ReleaseTimeframe>('week');
  const [selectedDay, setSelectedDay] = useState(() => currentDate || todayISO());
  const [selectedWeekDate, setSelectedWeekDate] = useState(() => currentDate || todayISO());
  const [selectedMonth, setSelectedMonth] = useState(() => (currentDate || todayISO()).slice(0, 7));
  const [customStartDate, setCustomStartDate] = useState(() => addDaysISO(todayISO(), -7));
  const [customEndDate, setCustomEndDate] = useState(() => todayISO());

  // Aggregate all modules: base company modules + any custom modules or unassigned module present in completed tasks
  const allAvailableModules = useMemo(() => {
    const set = new Set<string>(modules);
    let hasUnassigned = false;
    entries.forEach(e => {
      if (e.workDone === 'A Completed') {
        const trimmed = (e.module || '').trim();
        if (!trimmed) {
          hasUnassigned = true;
        } else {
          set.add(trimmed);
        }
      }
    });
    const list = Array.from(set);
    if (hasUnassigned) {
      list.push('General / Unassigned');
    }
    return list;
  }, [modules, entries]);

  // Module filter states (defaults to all available modules)
  const [selectedModules, setSelectedModules] = useState<string[]>(() => allAvailableModules);

  // Sync selected modules when available modules list expands
  useEffect(() => {
    setSelectedModules(prev => {
      const merged = Array.from(new Set([...prev, ...allAvailableModules]));
      return merged.length ? merged : allAvailableModules;
    });
  }, [allAvailableModules]);

  // Formatting options tuned specifically to user's exact template:
  // Primary default: 'subfeature-grouped' (## Module / ### Screen / - Description)
  const [formatStyle, setFormatStyle] = useState<ReleaseFormatStyle>('subfeature-grouped');
  const [releaseTag, setReleaseTag] = useState('v1.0.11');
  const [isTagCustom, setIsTagCustom] = useState(false);
  const [includeMeetings, setIncludeMeetings] = useState(false); // DO NOT INCLUDE MEETINGS BY DEFAULT
  const [includeHours, setIncludeHours] = useState(false);       // HOURS NOT NEEDED BY DEFAULT
  const [boldTitles, setBoldTitles] = useState(true);
  const [includeReferences, setIncludeReferences] = useState(false);
  const [includeModuleEmojis, setIncludeModuleEmojis] = useState(false);

  // Excluded tasks (for task selection checklist)
  const [excludedTaskIds, setExcludedTaskIds] = useState<Set<string>>(new Set());
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);

  // View & Edit state
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'split'>('preview');
  const [markdown, setMarkdown] = useState('');
  const [isManualEdited, setIsManualEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derived week range info
  const weekInfo = useMemo(() => getWeekRange(selectedWeekDate), [selectedWeekDate]);

  // Dynamic period label and default release tag
  const periodDetails = useMemo(() => {
    switch (timeframe) {
      case 'day': {
        const dStr = formatSheetDate(selectedDay);
        const fullPretty = prettyDate(selectedDay, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        return {
          label: `${fullPretty} (${dStr})`,
          defaultTag: `v1.0.11`,
          defaultTitle: `Release Notes – v1.0.11`,
        };
      }
      case 'week': {
        const startStr = formatSheetDate(weekInfo.start);
        const endStr = formatSheetDate(weekInfo.end);
        return {
          label: `Week ${weekInfo.weekNum} (${startStr} – ${endStr})`,
          defaultTag: `v1.0.11`,
          defaultTitle: `Release Notes – v1.0.11`,
        };
      }
      case 'month': {
        const mLabel = monthLabel(selectedMonth);
        return {
          label: mLabel,
          defaultTag: `v1.0.11`,
          defaultTitle: `Release Notes – v1.0.11`,
        };
      }
      case 'custom': {
        const s = formatSheetDate(customStartDate);
        const e = formatSheetDate(customEndDate);
        return {
          label: `${s} to ${e}`,
          defaultTag: `v1.0.11`,
          defaultTitle: `Release Notes – v1.0.11`,
        };
      }
      case 'all':
      default:
        return {
          label: 'All-Time Completed Tasks',
          defaultTag: 'v1.0.11',
          defaultTitle: 'Release Notes – v1.0.11',
        };
    }
  }, [timeframe, selectedDay, selectedMonth, weekInfo, customStartDate, customEndDate]);

  // Set default release tag when timeframe changes unless user typed a custom tag
  useEffect(() => {
    if (!isTagCustom) {
      setReleaseTag(periodDetails.defaultTag);
    }
  }, [periodDetails.defaultTag, isTagCustom]);

  // Filter ONLY COMPLETED tasks that match timeframe and selected modules
  // AND exclude meetings unless user opted in
  const candidateTasks = useMemo(() => {
    return entries.filter(e => {
      // 1. MUST be Completed
      if (e.workDone !== 'A Completed') return false;

      // 2. Exclude meetings if disabled
      if (!includeMeetings && isMeetingTask(e)) return false;

      // 3. Timeframe match
      if (timeframe === 'day' && e.date !== selectedDay) return false;
      if (timeframe === 'week' && (e.date < weekInfo.start || e.date > weekInfo.end)) return false;
      if (timeframe === 'month' && !e.date.startsWith(selectedMonth)) return false;
      if (timeframe === 'custom') {
        if (customStartDate && e.date < customStartDate) return false;
        if (customEndDate && e.date > customEndDate) return false;
      }

      // 4. Module match
      const taskMod = (e.module || '').trim();
      const matchMod = taskMod || 'General / Unassigned';
      if (selectedModules.length > 0 && !selectedModules.includes(matchMod) && !selectedModules.includes(taskMod)) {
        return false;
      }

      return true;
    });
  }, [entries, timeframe, selectedDay, weekInfo, selectedMonth, customStartDate, customEndDate, selectedModules, includeMeetings]);

  // Active tasks (excluding user-deselected tasks)
  const activeTasks = useMemo(() => {
    return candidateTasks.filter(t => !excludedTaskIds.has(t.id));
  }, [candidateTasks, excludedTaskIds]);

  // Format a single work task into "Feature Title: Description"
  const formatTaskLine = (
    task: WorkEntry,
    style: 'bullets' | 'plain',
    boldTitle: boolean,
    showRef: boolean,
    showHours: boolean
  ) => {
    const act = (task.activity || '').trim();
    const remarks = (task.appRemarks || '').trim();

    let title = '';
    let desc = '';

    if (act.includes(':')) {
      const colonIdx = act.indexOf(':');
      title = act.slice(0, colonIdx).trim();
      desc = act.slice(colonIdx + 1).trim();
    } else if (remarks) {
      title = act;
      desc = remarks;
    } else {
      title = act;
    }

    const refSuffix = showRef && task.reference ? ` (#${task.reference.replace(/^#/, '')})` : '';
    const hourSuffix = showHours && task.hours ? ` (${Number(task.hours).toFixed(2)} hrs)` : '';

    let formattedContent = '';
    if (desc) {
      if (boldTitle) {
        formattedContent = `**${title}**: ${desc}${refSuffix}${hourSuffix}`;
      } else {
        formattedContent = `${title}: ${desc}${refSuffix}${hourSuffix}`;
      }
    } else {
      if (boldTitle) {
        formattedContent = `**${title}**${refSuffix}${hourSuffix}`;
      } else {
        formattedContent = `${title}${refSuffix}${hourSuffix}`;
      }
    }

    return style === 'bullets' ? `- ${formattedContent}` : formattedContent;
  };

  // Generate Release Notes Markdown / Text
  const generateMarkdown = () => {
    const totalCount = activeTasks.length;

    // Group tasks by module
    const tasksByModule: Record<string, WorkEntry[]> = {};
    activeTasks.forEach(task => {
      const mod = task.module?.trim() || 'Administration';
      if (!tasksByModule[mod]) tasksByModule[mod] = [];
      tasksByModule[mod].push(task);
    });

    const moduleKeys = Object.keys(tasksByModule).sort((a, b) => {
      // Prioritize Administration, General Ledger, Shipping first
      if (a === 'Administration') return -1;
      if (b === 'Administration') return 1;
      if (a === 'General Ledger') return -1;
      if (b === 'General Ledger') return 1;
      if (a === 'Shipping') return -1;
      if (b === 'Shipping') return 1;
      return a.localeCompare(b);
    });

    if (totalCount === 0) {
      return `*No completed deliverables found for the selected period and modules.*`;
    }

    const lines: string[] = [];
    const mainTitle = `# Release Notes – ${releaseTag || 'v1.0.11'}`;

    if (formatStyle === 'subfeature-grouped') {
      // EXACT FORMAT AS REQUESTED:
      // # Release Notes – v1.0.11
      // ## Administration
      // - Feature description...
      // ## General Ledger
      // ### Chart of Accounts
      // - Feature description...
      lines.push(mainTitle);
      lines.push('');

      moduleKeys.forEach((mod, modIdx) => {
        if (modIdx > 0) lines.push('');
        const modHeading = includeModuleEmojis ? `## ${getModuleEmoji(mod)} ${mod}` : `## ${mod}`;
        lines.push(modHeading);

        const modTasks = tasksByModule[mod];
        const directItems: string[] = [];
        const subfeatures: { name: string; items: string[] }[] = [];
        const subfeatureMap = new Map<string, string[]>();

        modTasks.forEach(task => {
          const { subfeature, description } = parseTaskItem(task);
          const refSuffix = includeReferences && task.reference ? ` (#${task.reference.replace(/^#/, '')})` : '';
          const hourSuffix = includeHours && task.hours ? ` (${Number(task.hours).toFixed(2)} hrs)` : '';
          const fullDesc = `${description}${refSuffix}${hourSuffix}`;

          if (!subfeature) {
            directItems.push(fullDesc);
          } else {
            if (!subfeatureMap.has(subfeature)) {
              const list: string[] = [];
              subfeatureMap.set(subfeature, list);
              subfeatures.push({ name: subfeature, items: list });
            }
            subfeatureMap.get(subfeature)!.push(fullDesc);
          }
        });

        // Direct items under ## Module (e.g. ## Administration)
        directItems.forEach(item => {
          const parts = item.split(/\r?\n/).map(l => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
          if (parts.length > 1) {
            parts.forEach(p => lines.push(`- ${p}`));
          } else {
            lines.push(`- ${item}`);
          }
        });

        // Subfeatures under ### Subfeature (e.g. ## General Ledger -> ### Chart of Accounts)
        subfeatures.forEach((sub, sIdx) => {
          if (directItems.length > 0 || sIdx > 0) {
            lines.push('');
          }
          lines.push(`### ${sub.name}`);
          sub.items.forEach(item => {
            const parts = item.split(/\r?\n/).map(l => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
            if (parts.length > 1) {
              parts.forEach(p => lines.push(`- ${p}`));
            } else {
              lines.push(`- ${item}`);
            }
          });
        });
      });
    } else if (formatStyle === 'clean-bullets') {
      // Clean Module Bullets: ### Module \n * **Title**: Description
      lines.push(mainTitle);
      lines.push('');
      moduleKeys.forEach((mod, idx) => {
        if (idx > 0) lines.push('');
        const modHeader = includeModuleEmojis ? `### ${getModuleEmoji(mod)} ${mod}` : `### ${mod}`;
        lines.push(modHeader);
        tasksByModule[mod].forEach(task => {
          lines.push(formatTaskLine(task, 'bullets', boldTitles, includeReferences, includeHours));
        });
      });
    } else if (formatStyle === 'clean-plain') {
      // Plain Text Format: Module \n Feature Title: Description
      lines.push(`Release Notes – ${releaseTag || 'v1.0.11'}`);
      lines.push('');
      moduleKeys.forEach((mod, idx) => {
        if (idx > 0) lines.push('');
        const modHeader = includeModuleEmojis ? `${getModuleEmoji(mod)} ${mod}` : mod;
        lines.push(modHeader);
        tasksByModule[mod].forEach(task => {
          lines.push(formatTaskLine(task, 'plain', boldTitles, includeReferences, includeHours));
        });
      });
    } else if (formatStyle === 'github-changelog') {
      // Official GitHub "What's Changed" format
      lines.push("## 🚀 What's Changed");
      lines.push('');
      moduleKeys.forEach(mod => {
        const modHeader = includeModuleEmojis ? `### ${getModuleEmoji(mod)} ${mod}` : `### ${mod}`;
        lines.push(modHeader);
        tasksByModule[mod].forEach(task => {
          const refStr = task.reference ? ` in #${task.reference.replace(/^#/, '')}` : '';
          const hourStr = includeHours && task.hours ? ` (${Number(task.hours).toFixed(2)}h)` : '';
          lines.push(`* ${task.activity}${refStr}${hourStr}`);
        });
        lines.push('');
      });
      lines.push('**Full Changelog**: https://github.com/org/repo/commits/' + (releaseTag || 'main'));
    }

    return lines.join('\n');
  };

  // Re-generate markdown when configuration changes (unless manually edited)
  useEffect(() => {
    if (!isManualEdited) {
      setMarkdown(generateMarkdown());
    }
  }, [
    candidateTasks,
    activeTasks,
    formatStyle,
    releaseTag,
    includeHours,
    includeMeetings,
    boldTitles,
    includeReferences,
    includeModuleEmojis,
    periodDetails,
    isManualEdited,
  ]);

  // Handle manual edits
  const handleMarkdownChange = (newVal: string) => {
    setMarkdown(newVal);
    setIsManualEdited(true);
  };

  // Reset to auto-generated
  const handleResetToGenerated = () => {
    if (isManualEdited) {
      if (!window.confirm('Reset release notes back to auto-generated content? Your manual edits will be overwritten.')) {
        return;
      }
    }
    setIsManualEdited(false);
    setIsTagCustom(false);
    setMarkdown(generateMarkdown());
    setNotice('Release notes regenerated from tracker tasks.');
  };

  // Quick formatting insert helpers for editor
  const insertFormatting = (prefix: string, suffix = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);

    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    handleMarkdownChange(newText);

    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + (selected ? selected.length : 4));
    }, 10);
  };

  // Copy to clipboard with multi-tier fallback
  const handleCopy = async () => {
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(markdown);
        success = true;
      } catch {
        // Fall back below
      }
    }
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = markdown;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      setNotice('Release notes copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      setNotice('Could not copy to clipboard. Please copy directly from the editor.');
    }
  };

  // Download markdown file
  const handleDownload = () => {
    const cleanTag = (releaseTag || 'RELEASE_NOTES').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filename = `${cleanTag}.md`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setNotice(`Downloaded ${filename}`);
  };

  // Toggle module selection
  const toggleModule = (mod: string) => {
    setSelectedModules(prev => {
      if (prev.includes(mod)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(m => m !== mod);
      }
      return [...prev, mod];
    });
    setIsManualEdited(false);
  };

  // Quick module presets
  const selectAllModules = () => {
    setSelectedModules(allAvailableModules);
    setIsManualEdited(false);
  };

  const selectShippingAndAdmin = () => {
    const target = ['Administration', 'General Ledger', 'Shipping'].filter(m => allAvailableModules.includes(m));
    setSelectedModules(target.length > 0 ? target : ['Administration', 'General Ledger', 'Shipping']);
    setIsManualEdited(false);
  };

  // Toggle individual task inclusion
  const toggleTaskExclusion = (taskId: string) => {
    setExcludedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
    setIsManualEdited(false);
  };

  const selectAllCandidateTasks = () => {
    setExcludedTaskIds(new Set());
    setIsManualEdited(false);
  };

  const deselectAllCandidateTasks = () => {
    setExcludedTaskIds(new Set(candidateTasks.map(t => t.id)));
    setIsManualEdited(false);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop release-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal release-modal" role="dialog" aria-labelledby="release-modal-title">
        {/* Header */}
        <div className="release-modal-header">
          <div className="release-modal-title-row">
            <div className="release-badge-icon">
              <GitPullRequest size={20} />
            </div>
            <div>
              <h2 id="release-modal-title">GitHub Release Notes Generator</h2>
              <p>
                Formats completed deliverables under <strong>Administration</strong>, <strong>General Ledger</strong>, <strong>Shipping</strong>, etc. into your clean release format.
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close release notes generator">
            <X size={18} />
          </button>
        </div>

        {/* Top Control Bar: Timeframe & Date Picker */}
        <div className="release-controls-card">
          <div className="release-timeframe-header">
            <div className="release-timeframe-tabs">
              {(['day', 'week', 'month', 'custom', 'all'] as ReleaseTimeframe[]).map(tf => (
                <button
                  key={tf}
                  type="button"
                  className={`timeframe-pill-btn ${timeframe === tf ? 'active' : ''}`}
                  onClick={() => {
                    setTimeframe(tf);
                    setIsManualEdited(false);
                  }}
                >
                  {tf === 'day' && '📅 Day'}
                  {tf === 'week' && '🗓️ Week'}
                  {tf === 'month' && '📊 Month'}
                  {tf === 'custom' && '⚙️ Custom Range'}
                  {tf === 'all' && '🌐 All Time'}
                </button>
              ))}
            </div>

            {/* Timeframe Navigation Controls */}
            <div className="release-date-subnav">
              {timeframe === 'day' && (
                <div className="date-nav-compact">
                  <button
                    type="button"
                    className="icon-button-sm"
                    title="Previous day"
                    onClick={() => {
                      setSelectedDay(prev => addDaysISO(prev, -1));
                      setIsManualEdited(false);
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <input
                    type="date"
                    className="compact-date-input"
                    value={selectedDay}
                    onChange={e => {
                      if (e.target.value) {
                        setSelectedDay(e.target.value);
                        setIsManualEdited(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button-sm"
                    title="Next day"
                    onClick={() => {
                      setSelectedDay(prev => addDaysISO(prev, 1));
                      setIsManualEdited(false);
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="tag-pill-btn"
                    onClick={() => {
                      setSelectedDay(todayISO());
                      setIsManualEdited(false);
                    }}
                  >
                    Today
                  </button>
                </div>
              )}

              {timeframe === 'week' && (
                <div className="date-nav-compact">
                  <button
                    type="button"
                    className="icon-button-sm"
                    title="Previous week"
                    onClick={() => {
                      setSelectedWeekDate(prev => addDaysISO(prev, -7));
                      setIsManualEdited(false);
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="week-range-label" title={`${weekInfo.start} to ${weekInfo.end}`}>
                    <CalendarDays size={13} />
                    <strong>Week {weekInfo.weekNum}</strong>
                    <span>({formatSheetDate(weekInfo.start)} – {formatSheetDate(weekInfo.end)})</span>
                  </span>
                  <button
                    type="button"
                    className="icon-button-sm"
                    title="Next week"
                    onClick={() => {
                      setSelectedWeekDate(prev => addDaysISO(prev, 7));
                      setIsManualEdited(false);
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="tag-pill-btn"
                    onClick={() => {
                      setSelectedWeekDate(todayISO());
                      setIsManualEdited(false);
                    }}
                  >
                    This Week
                  </button>
                </div>
              )}

              {timeframe === 'month' && (
                <div className="date-nav-compact">
                  <button
                    type="button"
                    className="icon-button-sm"
                    title="Previous month"
                    onClick={() => {
                      setSelectedMonth(prev => addMonthsISO(prev, -1));
                      setIsManualEdited(false);
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <input
                    type="month"
                    className="compact-date-input"
                    value={selectedMonth}
                    onChange={e => {
                      if (e.target.value) {
                        setSelectedMonth(e.target.value);
                        setIsManualEdited(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button-sm"
                    title="Next month"
                    onClick={() => {
                      setSelectedMonth(prev => addMonthsISO(prev, 1));
                      setIsManualEdited(false);
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="tag-pill-btn"
                    onClick={() => {
                      setSelectedMonth(todayISO().slice(0, 7));
                      setIsManualEdited(false);
                    }}
                  >
                    This Month
                  </button>
                </div>
              )}

              {timeframe === 'custom' && (
                <div className="date-nav-compact">
                  <span className="custom-range-label">From:</span>
                  <input
                    type="date"
                    className="compact-date-input"
                    value={customStartDate}
                    onChange={e => {
                      setCustomStartDate(e.target.value);
                      setIsManualEdited(false);
                    }}
                  />
                  <span className="custom-range-label">To:</span>
                  <input
                    type="date"
                    className="compact-date-input"
                    value={customEndDate}
                    onChange={e => {
                      setCustomEndDate(e.target.value);
                      setIsManualEdited(false);
                    }}
                  />
                </div>
              )}

              {timeframe === 'all' && (
                <span className="all-time-tag">
                  <Sparkles size={13} />
                  <span>All completed records in tracker</span>
                </span>
              )}
            </div>
          </div>

          {/* Module Filter Chips */}
          <div className="release-module-bar">
            <div className="module-bar-header">
              <span className="section-small-title">
                <Package size={13} />
                <strong>Filter Modules:</strong>
              </span>
              <div className="module-quick-presets">
                <button
                  type="button"
                  className={`preset-btn ${selectedModules.length === allAvailableModules.length ? 'active' : ''}`}
                  onClick={selectAllModules}
                >
                  All Modules
                </button>
                <button
                  type="button"
                  className={`preset-btn ${
                    selectedModules.length >= 2 &&
                    selectedModules.includes('Administration') &&
                    selectedModules.includes('General Ledger')
                      ? 'active'
                      : ''
                  }`}
                  onClick={selectShippingAndAdmin}
                  title="Only include Administration, General Ledger, Shipping"
                >
                  ⚙️ Admin, GL & 📦 Shipping
                </button>
              </div>
            </div>
            <div className="release-module-chips">
              {allAvailableModules.map(mod => {
                const isSelected = selectedModules.includes(mod);
                return (
                  <button
                    key={mod}
                    type="button"
                    className={`release-module-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleModule(mod)}
                  >
                    <span className="module-chip-emoji">{getModuleEmoji(mod)}</span>
                    <span className="module-chip-name">{mod}</span>
                    {isSelected ? <Check size={12} /> : <span className="chip-empty-dot" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Formatting Options Bar */}
          <div className="release-options-grid">
            <div className="option-field">
              <label>Release Version:</label>
              <div className="tag-input-wrapper">
                <Tag size={13} />
                <input
                  type="text"
                  placeholder="v1.0.11"
                  value={releaseTag}
                  onChange={e => {
                    setReleaseTag(e.target.value);
                    setIsTagCustom(true);
                    setIsManualEdited(false);
                  }}
                />
              </div>
            </div>

            <div className="option-field">
              <label>Layout Style:</label>
              <select
                value={formatStyle}
                onChange={e => {
                  setFormatStyle(e.target.value as ReleaseFormatStyle);
                  setIsManualEdited(false);
                }}
              >
                <option value="subfeature-grouped">📑 Sections & Sub-features (## Module / ### Screen)</option>
                <option value="clean-bullets">✨ Clean Bullets (* **Title**: Description)</option>
                <option value="clean-plain">📄 Plain Text Format (Module on top, no bullets)</option>
                <option value="github-changelog">🚀 GitHub Official What's Changed</option>
              </select>
            </div>

            <div className="option-checkboxes">
              <label className="checkbox-label" title="Do not include meetings or discussions">
                <input
                  type="checkbox"
                  checked={includeMeetings}
                  onChange={e => {
                    setIncludeMeetings(e.target.checked);
                    setIsManualEdited(false);
                  }}
                />
                <span style={{ color: !includeMeetings ? '#0f766e' : '#475569', fontWeight: !includeMeetings ? 700 : 500 }}>
                  <Users size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  {includeMeetings ? 'Include Meetings' : 'Exclude Meetings'}
                </span>
              </label>

              <label className="checkbox-label" title="Include logged hours in release notes">
                <input
                  type="checkbox"
                  checked={includeHours}
                  onChange={e => {
                    setIncludeHours(e.target.checked);
                    setIsManualEdited(false);
                  }}
                />
                <span style={{ color: includeHours ? '#0f766e' : '#64748b' }}>
                  <Clock3 size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  Hours ({includeHours ? 'Shown' : 'Hidden'})
                </span>
              </label>

              <label className="checkbox-label" title="Show #Issue / Ticket reference">
                <input
                  type="checkbox"
                  checked={includeReferences}
                  onChange={e => {
                    setIncludeReferences(e.target.checked);
                    setIsManualEdited(false);
                  }}
                />
                <span>Ticket (#)</span>
              </label>

              <label className="checkbox-label" title="Bold Feature Titles in bullet format">
                <input
                  type="checkbox"
                  checked={boldTitles}
                  onChange={e => {
                    setBoldTitles(e.target.checked);
                    setIsManualEdited(false);
                  }}
                />
                <span>Bold Titles</span>
              </label>

              <label className="checkbox-label" title="Show emoji beside module names">
                <input
                  type="checkbox"
                  checked={includeModuleEmojis}
                  onChange={e => {
                    setIncludeModuleEmojis(e.target.checked);
                    setIsManualEdited(false);
                  }}
                />
                <span>Emojis</span>
              </label>
            </div>
          </div>
        </div>

        {/* Task Selection Collapsible Drawer */}
        <div className="release-task-drawer-toggle">
          <button
            type="button"
            className="drawer-toggle-btn"
            onClick={() => setShowTaskDrawer(prev => !prev)}
          >
            <div className="drawer-title">
              <ListFilter size={15} />
              <span>
                <strong>{candidateTasks.length} Completed Tasks Detected</strong>
                <small>({activeTasks.length} included in note · {candidateTasks.length - activeTasks.length} excluded {!includeMeetings && '· Meetings filtered out'})</small>
              </span>
            </div>
            <div className="drawer-actions">
              <span className="drawer-hint">{showTaskDrawer ? 'Hide checklist' : 'Select individual tasks'}</span>
              <ChevronDown size={15} className={`chevron-icon ${showTaskDrawer ? 'rotated' : ''}`} />
            </div>
          </button>

          {showTaskDrawer && (
            <div className="release-task-checklist-body">
              <div className="checklist-actions">
                <button type="button" className="text-link-btn" onClick={selectAllCandidateTasks}>
                  Select All
                </button>
                <span>·</span>
                <button type="button" className="text-link-btn" onClick={deselectAllCandidateTasks}>
                  Deselect All
                </button>
              </div>

              {candidateTasks.length === 0 ? (
                <div className="empty-tasks-notice">
                  <AlertCircle size={16} />
                  <span>No completed tasks found in this timeframe for the selected modules {!includeMeetings && '(Meetings are excluded)'}.</span>
                </div>
              ) : (
                <div className="checklist-items-scroll">
                  {candidateTasks.map(t => {
                    const isChecked = !excludedTaskIds.has(t.id);
                    return (
                      <label key={t.id} className={`checklist-item ${isChecked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTaskExclusion(t.id)}
                        />
                        <span className="item-module-badge">{getModuleEmoji(t.module)} {t.module || 'General'}</span>
                        <span className="item-activity">{t.activity}</span>
                        {t.reference && <span className="item-ref">#{t.reference.replace(/^#/, '')}</span>}
                        {includeHours && t.hours ? <span className="item-hours">{Number(t.hours).toFixed(2)}h</span> : null}
                        <span className="item-date">{formatSheetDate(t.date)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* View / Edit Mode Tabs */}
        <div className="release-editor-toolbar-header">
          <div className="editor-mode-tabs">
            <button
              type="button"
              className={`mode-tab ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <Eye size={14} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              className={`mode-tab ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => setActiveTab('edit')}
            >
              <Edit3 size={14} />
              <span>Edit Text</span>
              {isManualEdited && <span className="dirty-badge">Customized</span>}
            </button>
            <button
              type="button"
              className={`mode-tab ${activeTab === 'split' ? 'active' : ''}`}
              onClick={() => setActiveTab('split')}
              title="Side-by-side editing and preview"
            >
              <Columns size={14} />
              <span>Split View</span>
            </button>
          </div>

          <div className="editor-quick-actions">
            {isManualEdited && (
              <span className="custom-edit-indicator" title="Manual edits are preserved until reset">
                Manual edits applied
              </span>
            )}
            <button
              type="button"
              className="secondary-button small-btn"
              onClick={handleResetToGenerated}
              title="Reset content to freshly generated tracker tasks"
            >
              <RefreshCw size={13} />
              <span>Regenerate</span>
            </button>
          </div>
        </div>

        {/* Edit / Preview Area */}
        <div className="release-content-body">
          {/* Editor Helper Toolbar (visible in Edit or Split mode) */}
          {(activeTab === 'edit' || activeTab === 'split') && (
            <div className="markdown-helper-bar">
              <button type="button" onClick={() => insertFormatting('## ')} title="Add Module Heading (##)">
                ## Module
              </button>
              <button type="button" onClick={() => insertFormatting('### ')} title="Add Sub-screen Heading (###)">
                ### Screen
              </button>
              <button type="button" onClick={() => insertFormatting('- ')} title="Add dash bullet item">
                - Bullet
              </button>
              <button type="button" onClick={() => insertFormatting('**', '**')} title="Bold title">
                <strong>B</strong>
              </button>
              <button type="button" onClick={() => insertFormatting('`', '`')} title="Inline code">
                <Code size={12} />
              </button>
              <button type="button" onClick={() => insertFormatting('#')} title="Add ticket/issue reference">
                #Ref
              </button>
              <button type="button" onClick={() => insertFormatting('\n\n')} title="Add blank line">
                &para; Blank Line
              </button>
            </div>
          )}

          {/* Main Display Grid */}
          <div className={`release-panels-grid mode-${activeTab}`}>
            {/* Markdown Text Editor */}
            {(activeTab === 'edit' || activeTab === 'split') && (
              <div className="editor-pane">
                <textarea
                  ref={textareaRef}
                  className="release-markdown-textarea"
                  value={markdown}
                  onChange={e => handleMarkdownChange(e.target.value)}
                  placeholder="Release notes content..."
                  spellCheck={false}
                />
              </div>
            )}

            {/* GitHub Styled Preview */}
            {(activeTab === 'preview' || activeTab === 'split') && (
              <div className="preview-pane">
                <div className="github-preview-wrapper">
                  <div className="github-release-card">
                    <GitHubMarkdownRenderer
                      content={markdown}
                      availableModules={allAvailableModules}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="release-modal-footer">
          <div className="footer-status-info">
            <span className="task-summary-badge">
              <CheckCircle2 size={14} />
              <strong>{activeTasks.length}</strong> items ready
            </span>
            {!includeMeetings && (
              <span className="meetings-excluded-badge" title="Meeting items filtered out">
                Meetings excluded
              </span>
            )}
            {includeHours && (
              <span className="hours-summary-badge">
                <Clock3 size={14} />
                {activeTasks.reduce((s, t) => s + (Number(t.hours) || 0), 0).toFixed(2)} hrs total
              </span>
            )}
          </div>

          <div className="footer-action-buttons">
            <button
              type="button"
              className="secondary-button"
              onClick={handleDownload}
              title="Download as a .md text file"
            >
              <Download size={15} />
              <span>Download .md</span>
            </button>
            <button
              type="button"
              className="primary-button copy-gh-btn"
              onClick={handleCopy}
              title="Copy formatted notes directly to clipboard"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Release Notes'}</span>
            </button>
            <button type="button" className="secondary-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Lightweight, pure React GitHub Markdown Renderer
function GitHubMarkdownRenderer({
  content,
  availableModules = [],
}: {
  content: string;
  availableModules?: string[];
}) {
  const blocks = useMemo(() => {
    if (!content) return [];
    const lines = content.split(/\r?\n/);
    const parsedBlocks: React.ReactNode[] = [];
    let i = 0;

    const isModuleHeading = (str: string) => {
      const clean = str.replace(/^[#\s*•\-:]+/, '').replace(/:$/, '').trim();
      return availableModules.includes(clean);
    };

    while (i < lines.length) {
      const line = lines[i];

      // Empty line
      if (!line.trim()) {
        i++;
        continue;
      }

      // Horizontal Rule
      if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
        parsedBlocks.push(<hr key={`hr-${i}`} className="gh-hr" />);
        i++;
        continue;
      }

      // Multiline Code Fences
      if (line.startsWith('```')) {
        const codeLines: string[] = [];
        const lang = line.slice(3).trim();
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing ```
        parsedBlocks.push(
          <div key={`codeblock-${i}`} className="gh-code-block-container">
            {lang && <span className="gh-code-lang">{lang}</span>}
            <pre className="gh-code-block">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        );
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        parsedBlocks.push(<h1 key={`h1-${i}`} className="gh-h1">{renderInlineMarkdown(line.slice(2))}</h1>);
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        parsedBlocks.push(<h2 key={`h2-${i}`} className="gh-h2">{renderInlineMarkdown(line.slice(3))}</h2>);
        i++;
        continue;
      }
      if (line.startsWith('### ')) {
        parsedBlocks.push(<h3 key={`h3-${i}`} className="gh-h3">{renderInlineMarkdown(line.slice(4))}</h3>);
        i++;
        continue;
      }
      if (line.startsWith('#### ')) {
        parsedBlocks.push(<h4 key={`h4-${i}`} className="gh-h4">{renderInlineMarkdown(line.slice(5))}</h4>);
        i++;
        continue;
      }

      // Standalone Module Name (when using plain text style e.g. "Administration", "General Ledger")
      if (isModuleHeading(line.trim())) {
        parsedBlocks.push(
          <h3 key={`mod-plain-${i}`} className="gh-h3 gh-plain-module-heading">
            {renderInlineMarkdown(line.trim())}
          </h3>
        );
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('>')) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        parsedBlocks.push(
          <blockquote key={`quote-${i}`} className="gh-blockquote">
            {quoteLines.map((ql, qIdx) => (
              <p key={qIdx}>{renderInlineMarkdown(ql)}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // Markdown Table
      if (line.startsWith('|') && line.endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('|') && lines[i].endsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          const headers = tableLines[0].split('|').slice(1, -1).map(h => h.trim());
          const rows = tableLines.slice(2).map(r => r.split('|').slice(1, -1).map(c => c.trim()));
          parsedBlocks.push(
            <div key={`table-${i}`} className="gh-table-container">
              <table className="gh-table">
                <thead>
                  <tr>
                    {headers.map((h, idx) => (
                      <th key={idx}>{renderInlineMarkdown(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{renderInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        } else {
          parsedBlocks.push(<p key={`p-${i}`} className="gh-p">{renderInlineMarkdown(tableLines[0])}</p>);
          continue;
        }
      }

      // List Items (Unordered, Checkbox, Ordered)
      if (/^\s*([*+-]|\d+\.)\s/.test(line)) {
        const listItems: { text: string; isTask?: boolean; checked?: boolean }[] = [];
        while (i < lines.length && (/^\s*([*+-]|\d+\.)\s/.test(lines[i]) || /^\s+>/.test(lines[i]))) {
          const l = lines[i];
          if (/^\s+>/.test(l)) {
            // Append quote remark to previous item
            if (listItems.length > 0) {
              listItems[listItems.length - 1].text += `\n> ${l.replace(/^\s*>\s?/, '')}`;
            }
            i++;
            continue;
          }

          const taskMatch = l.match(/^\s*[*+-]\s+\[([ xX])\]\s+(.*)$/);
          if (taskMatch) {
            listItems.push({
              text: taskMatch[2],
              isTask: true,
              checked: taskMatch[1].toLowerCase() === 'x',
            });
          } else {
            const bulletMatch = l.match(/^\s*([*+-]|\d+\.)\s+(.*)$/);
            listItems.push({
              text: bulletMatch ? bulletMatch[2] : l,
            });
          }
          i++;
        }

        parsedBlocks.push(
          <ul key={`ul-${i}`} className="gh-list">
            {listItems.map((item, itemIdx) => (
              <li key={itemIdx} className={item.isTask ? 'gh-task-item' : 'gh-bullet-item'}>
                {item.isTask && (
                  <input
                    type="checkbox"
                    readOnly
                    checked={item.checked}
                    className="gh-task-checkbox"
                  />
                )}
                <div className="gh-item-content">
                  {item.text.split('\n> ').map((part, pIdx) => (
                    pIdx === 0 ? (
                      <span key={pIdx}>{renderInlineMarkdown(part)}</span>
                    ) : (
                      <blockquote key={pIdx} className="gh-sub-quote">
                        {renderInlineMarkdown(part)}
                      </blockquote>
                    )
                  ))}
                </div>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Subscript / Small text
      if (line.startsWith('<sub>') && line.endsWith('</sub>')) {
        parsedBlocks.push(
          <div key={`sub-${i}`} className="gh-subscript">
            {renderInlineMarkdown(line.slice(5, -6))}
          </div>
        );
        i++;
        continue;
      }

      // Feature Line: "Title: Description" in Plain Mode
      if (line.includes(': ')) {
        const colonIdx = line.indexOf(': ');
        const t = line.slice(0, colonIdx);
        const d = line.slice(colonIdx + 2);
        parsedBlocks.push(
          <p key={`p-feat-${i}`} className="gh-p gh-plain-feature-line">
            <strong className="gh-plain-title">{renderInlineMarkdown(t)}: </strong>
            <span>{renderInlineMarkdown(d)}</span>
          </p>
        );
        i++;
        continue;
      }

      // Regular Paragraph
      parsedBlocks.push(
        <p key={`p-${i}`} className="gh-p">
          {renderInlineMarkdown(line)}
        </p>
      );
      i++;
    }

    return parsedBlocks;
  }, [content, availableModules]);

  return <div className="gh-markdown-body">{blocks}</div>;
}

// Inline Markdown parser (bold, italic, code, link, issue tags)
function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Split tokens by regex pattern
  // Matches: `code`, **bold**, *italic*, [label](url), (#123) or #123, <sub>text</sub>
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // 1. Code: `...`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      const codeVal = codeMatch[1];
      const isWorkType = ['[Development]', '[Bug Fixing]', '[Testing]', '[Investigation]', '[Training]', '[Meeting / Discussion]'].some(t => codeVal.includes(t));
      parts.push(
        <code key={keyIdx++} className={isWorkType ? 'gh-type-pill' : 'gh-code'}>
          {codeVal}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 2. Bold: **...**
    const boldMatch = remaining.match(/^\*\*([^*]+?)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={keyIdx++}>{renderInlineMarkdown(boldMatch[1])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 3. Italic: *...*
    const italicMatch = remaining.match(/^\*([^*]+?)\*/);
    if (italicMatch) {
      parts.push(<em key={keyIdx++}>{renderInlineMarkdown(italicMatch[1])}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 4. Links: [label](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a key={keyIdx++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="gh-link">
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 5. GitHub Issue/PR reference: (#123) or bare #123 / #SHIP-123
    const parenIssueMatch = remaining.match(/^\(#?([A-Za-z0-9_-]+)\)/);
    if (parenIssueMatch) {
      parts.push(
        <span key={keyIdx++} className="gh-issue-ref">
          #{parenIssueMatch[1]}
        </span>
      );
      remaining = remaining.slice(parenIssueMatch[0].length);
      continue;
    }

    const bareIssueMatch = remaining.match(/^#([A-Za-z0-9_-]+)\b/);
    if (bareIssueMatch) {
      parts.push(
        <span key={keyIdx++} className="gh-issue-ref">
          #{bareIssueMatch[1]}
        </span>
      );
      remaining = remaining.slice(bareIssueMatch[0].length);
      continue;
    }

    // Regular text before the next special token
    const nextSpecial = remaining.search(/[`*\[\(#]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}
