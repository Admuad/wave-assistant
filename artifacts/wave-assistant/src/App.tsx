import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Award,
  Bell,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  LayoutDashboard,
  Menu,
  Play,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetContributorProfileQueryKey,
  getGetNotificationSettingsQueryKey,
  getGetWaveApplicationsQueryKey,
  getGetWaveIssuesQueryKey,
  getGetWaveOverviewQueryKey,
  getGetWaveActivityQueryKey,
  getHealthCheckQueryKey,
  useCreateWaveApplication,
  useGenerateProposal,
  useGetContributorProfile,
  useGetNotificationSettings,
  useGetWaveActivity,
  useGetWaveApplications,
  useGetWaveIssues,
  useGetWaveOverview,
  useHealthCheck,
  useRunAutopilotNow,
  useTestNotification,
  useUpdateContributorProfile,
  useUpdateNotificationSettings,
} from '@workspace/api-client-react';
import type {
  ActivityEntry,
  ContributorProfile,
  NotificationSettings,
  WaveApplication,
  WaveIssue,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function formatDate(value?: string | null) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function timeAgo(value?: string | null) {
  if (!value) return 'Not yet';
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false } });
  const profile = useGetContributorProfile({ query: { queryKey: getGetContributorProfileQueryKey(), retry: false } });
  const overview = useGetWaveOverview({ query: { queryKey: getGetWaveOverviewQueryKey(), retry: false } });
  const initials = profile.data?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'WA';

  return (
    <div className="app-shell noise">
      <aside className="sidebar">
        <Link href="/" className="brand" data-testid="link-brand">
          <span className="brand-mark"><Activity /></span>
          <span className="brand-name">wave assistant</span>
        </Link>
        <div className="side-label eyebrow">Autonomous Hub</div>
        <nav className="nav" aria-label="Primary navigation">
          <NavLink href="/" icon={<LayoutDashboard />} label="Wave overview" active={location === '/'} testId="link-dashboard" />
          <NavLink href="/profile" icon={<UserRound />} label="Contributor profile" active={location === '/profile'} testId="link-profile" />
          <NavLink href="/notifications" icon={<Settings2 />} label="Settings & Credentials" active={location === '/notifications'} testId="link-notifications" />
        </nav>
        <div className="sidebar-spacer" />
        <div className="side-footer">
          <strong>Auto-Pilot Engine</strong>
          {overview.data?.autopilotEnabled ? (
            <span style={{ color: 'hsl(165 45% 60%)' }}>● Active (Monitoring & Applying)</span>
          ) : (
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>○ Standby mode</span>
          )}
          <div style={{ marginTop: 6 }}>15 max active slots preserved with instant Telegram assignment alerts.</div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" data-testid="button-open-navigation"><Menu /></button>
          <div className="topbar-title">Stellar Wave / Autonomous Assistant</div>
          <div className="topbar-right">
            <div className="health" data-testid="status-health">
              <span className={`health-dot ${health.isError ? 'error' : ''}`} />
              {health.isLoading ? 'Checking connection' : health.isError ? 'Connection issue' : 'System online'}
            </div>
            <Link href="/profile" className="avatar" data-testid="link-avatar">{initials}</Link>
          </div>
        </header>
        <main>{children}</main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <NavLink href="/" icon={<LayoutDashboard />} label="Wave" active={location === '/'} testId="mobile-link-dashboard" />
          <NavLink href="/profile" icon={<UserRound />} label="Profile" active={location === '/profile'} testId="mobile-link-profile" />
          <NavLink href="/notifications" icon={<Settings2 />} label="Settings" active={location === '/notifications'} testId="mobile-link-notifications" />
        </nav>
      </div>
    </div>
  );
}

function NavLink({ href, icon, label, active, testId }: { href: string; icon: ReactNode; label: string; active: boolean; testId: string }) {
  return <Link href={href} className={`nav-link ${active ? 'active' : ''}`} data-testid={testId}>{icon}<span>{label}</span></Link>;
}

function PageHeading({ title, description, meta }: { title: string; description: string; meta?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1><p>{description}</p></div>
      {meta && <div className="heading-meta">{meta}</div>}
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" data-testid="state-error">
      <CircleAlert size={19} />
      <p>{message}</p>
      {onRetry && <button className="ghost-button" onClick={onRetry} data-testid="button-retry"><RefreshCw size={13} /> Retry</button>}
    </div>
  );
}

function MetricCard({ label, value, detail, featured, progress }: { label: string; value: React.ReactNode; detail?: string; featured?: boolean; progress?: number }) {
  return (
    <div className={`metric-card ${featured ? 'featured' : ''}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {progress !== undefined && <div className="progress"><span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>}
      {detail && <div className="metric-detail">{detail}</div>}
    </div>
  );
}

function Dashboard() {
  const client = useQueryClient();
  const overview = useGetWaveOverview({ query: { queryKey: getGetWaveOverviewQueryKey() } });
  const activity = useGetWaveActivity({ query: { queryKey: getGetWaveActivityQueryKey() } });
  const applications = useGetWaveApplications({ query: { queryKey: getGetWaveApplicationsQueryKey() } });
  const settings = useGetNotificationSettings({ query: { queryKey: getGetNotificationSettingsQueryKey() } });
  const updateSettings = useUpdateNotificationSettings();
  const runAutopilot = useRunAutopilotNow();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'match' | 'points' | 'newest'>('match');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<WaveIssue | null>(null);

  const params = useMemo(() => ({ query: query || undefined, sort, onlyOpen }), [query, sort, onlyOpen]);
  const filteredIssues = useGetWaveIssues(params, { query: { queryKey: getGetWaveIssuesQueryKey(params) } });

  const data = overview.data;
  const issues = filteredIssues.data ?? [];
  const tracked = applications.data ?? [];
  const trackedIssueIds = new Set(tracked.filter((a) => a.status === 'pending' || a.status === 'assigned').map((a) => a.issueId));

  const toggleAutopilot = () => {
    if (!settings.data) return;
    const nextState = !settings.data.autopilotEnabled;
    updateSettings.mutate(
      {
        data: {
          telegramEnabled: settings.data.telegramEnabled,
          assignmentAlertsEnabled: settings.data.assignmentAlertsEnabled,
          telegramChatId: settings.data.telegramChatId,
          telegramBotToken: settings.data.telegramBotToken,
          dripsAuthToken: settings.data.dripsAuthToken,
          aiApiKey: settings.data.aiApiKey,
          aiProvider: settings.data.aiProvider,
          aiModel: settings.data.aiModel,
          autopilotEnabled: nextState,
          autopilotIntervalMinutes: settings.data.autopilotIntervalMinutes,
        },
      },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
          client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
        },
      },
    );
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/wave/sync', { method: 'POST' });
      client.invalidateQueries({ queryKey: getGetContributorProfileQueryKey() });
      client.invalidateQueries({ queryKey: getGetWaveApplicationsQueryKey() });
      client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
      client.invalidateQueries({ queryKey: getGetWaveActivityQueryKey() });
      client.invalidateQueries({ queryKey: getGetWaveIssuesQueryKey() });
    } catch (err) {
      console.error('Failed to sync with DripWave:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualRun = () => {
    runAutopilot.mutate(undefined, {
      onSuccess: () => {
        client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveApplicationsQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveActivityQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveIssuesQueryKey() });
      },
    });
  };

  return (
    <div className="content">
      <PageHeading
        title={data?.waveLabel || 'Current wave'}
        description={data?.programName ? `${data.programName} · Autonomous Issue Discovery, AI Application Engine & Assignment Alerts.` : 'Loading the Stellar Wave board.'}
        meta={data && <><strong>Next wave ends</strong><br />{formatDate(data.nextWaveEndsAt)}</>}
      />

      {/* Auto-Pilot Command Center */}
      <div className={`autopilot-banner ${data?.autopilotEnabled ? 'active' : ''}`} data-testid="banner-autopilot">
        <div className="autopilot-info">
          <span className="autopilot-pulse" />
          <div>
            <div className="autopilot-title">
              <Bot size={18} />
              <span>Auto-Pilot: {data?.autopilotEnabled ? 'Active & Monitoring' : 'Standby Mode'}</span>
            </div>
            <div className="autopilot-desc">
              {data?.lastAutopilotStatus || 'Scans DripWave for matching open spots, crafts AI proposals, and monitors assignments.'}
            </div>
          </div>
        </div>
        <div className="autopilot-controls">
          <button
            className="ghost-button"
            onClick={handleSync}
            disabled={isSyncing}
            style={{ background: 'hsl(207 23% 22%)', color: 'hsl(39 40% 98%)', borderColor: 'hsl(207 17% 32%)' }}
            title="Sync your DripWave profile and live submitted applications"
          >
            <RefreshCw className={isSyncing ? 'animate-spin' : ''} size={13} />
            {isSyncing ? 'Syncing DripWave…' : 'Sync DripWave'}
          </button>
          <button
            className="ghost-button"
            onClick={handleManualRun}
            disabled={runAutopilot.isPending}
            style={{ background: 'hsl(207 23% 22%)', color: 'hsl(39 40% 98%)', borderColor: 'hsl(207 17% 32%)' }}
            data-testid="button-run-autopilot"
          >
            {runAutopilot.isPending ? <RefreshCw className="animate-spin" size={13} /> : <Zap size={13} />}
            {runAutopilot.isPending ? 'Scanning & Applying…' : 'Scan & Apply Now'}
          </button>
          <Toggle on={Boolean(data?.autopilotEnabled)} onChange={toggleAutopilot} testId="toggle-autopilot-banner" />
        </div>
      </div>

      {overview.isError ? <QueryError message="The wave overview could not be loaded." onRetry={() => overview.refetch()} /> : (
        <>
          <div className="metric-grid">
            <MetricCard
              label="Application Slots"
              value={<>{data?.pendingApplications ?? 0} <small>/ {data?.applicationLimit ?? 15}</small></>}
              progress={data ? (data.pendingApplications / data.applicationLimit) * 100 : 0}
              detail={`${data?.availableSlots ?? 15} slots available`}
              featured
            />
            <MetricCard
              label="Open Opportunities"
              value={data?.openIssueCount ?? '—'}
              detail="strictly unassigned open spots"
            />
            <MetricCard
              label="Wave Reward Pool"
              value={data?.rewardBudget ?? '—'}
              detail="active bounty budget"
            />
            <MetricCard
              label="Assignments Won"
              value={data?.assignmentCount ?? 0}
              detail={data?.lastSyncedAt ? `Synced ${timeAgo(data.lastSyncedAt)}` : 'Live'}
            />
          </div>

          <div className="section-grid">
            <section className="panel" data-testid="panel-issue-board">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Available Open Opportunities</div>
                  <div className="panel-subtitle">Strictly unassigned issues matched against your skills and profile.</div>
                </div>
                <div className="panel-actions">
                  <span className="status-chip"><span />{issues.length} available</span>
                </div>
              </div>
              <div className="filters">
                <label className="searchbox">
                  <Search />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search issues, skills, or repositories"
                    aria-label="Search issues"
                    data-testid="input-search-issues"
                  />
                </label>
                <select
                  className="filter-select"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as typeof sort)}
                  aria-label="Sort issues"
                  data-testid="select-sort-issues"
                >
                  <option value="match">Best Match Score</option>
                  <option value="points">Highest Reward Points</option>
                  <option value="newest">Recently Added</option>
                </select>
                <button
                  className={`ghost-button ${onlyOpen ? 'active' : ''}`}
                  onClick={() => setOnlyOpen((current) => !current)}
                  data-testid="button-toggle-open"
                >
                  <Settings2 size={13} /> {onlyOpen ? 'Open Spots Only' : 'All Issues'}
                </button>
              </div>

              {filteredIssues.isLoading ? (
                <IssueSkeleton />
              ) : filteredIssues.isError ? (
                <QueryError message="Issues could not be loaded." onRetry={() => filteredIssues.refetch()} />
              ) : issues.length === 0 ? (
                <div className="empty-state" data-testid="state-empty-issues">
                  No open issues match these filters. Try adjusting your search query or profile skills.
                </div>
              ) : (
                <div className="issue-list">
                  {issues.map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      tracked={trackedIssueIds.has(issue.id)}
                      onApply={() => setSelectedIssue(issue)}
                    />
                  ))}
                </div>
              )}
            </section>

            <aside className="panel activity-panel" data-testid="panel-activity">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Live Activity Feed</div>
                  <div className="panel-subtitle">Applications, releases & assignments</div>
                </div>
                <Activity size={16} color="hsl(var(--muted-foreground))" />
              </div>
              {activity.isLoading ? (
                <ActivitySkeleton />
              ) : activity.isError ? (
                <QueryError message="Activity is unavailable." onRetry={() => activity.refetch()} />
              ) : (
                <ActivityList entries={activity.data ?? []} />
              )}
            </aside>
          </div>

          <ApplicationsPanel applications={tracked} />
        </>
      )}

      {selectedIssue && (
        <ApplyPitchModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}

function ApplicationsPanel({ applications }: { applications: WaveApplication[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const client = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/wave/applications/${id}`, { method: 'DELETE' });
      client.invalidateQueries({ queryKey: getGetWaveApplicationsQueryKey() });
      client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
      client.invalidateQueries({ queryKey: getGetWaveActivityQueryKey() });
    } catch (err) {
      console.error('Failed to remove application:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="panel applications-panel" data-testid="panel-applications">
      <div className="panel-header">
        <div>
          <div className="panel-title">Your Tracked Applications</div>
          <div className="panel-subtitle">Active slots, proposals submitted, and assignment statuses.</div>
        </div>
        <span className="status-chip"><Users size={11} /> {applications.length} total tracked</span>
      </div>
      {!applications.length ? (
        <div className="empty-state" data-testid="state-empty-applications">
          No active applications. Select an open issue or enable Auto-Pilot to start applying automatically.
        </div>
      ) : (
        <div className="application-table">
          {applications.map((application) => {
            const isExpanded = expandedId === application.id;
            return (
              <div key={application.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                <div className="application-row" data-testid={`application-${application.id}`}>
                  <div>
                    <strong>{application.issueTitle}</strong>
                    <span>{application.repository}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`status-chip ${application.status}`}>
                      <span />{application.status}
                    </div>
                    {application.proposalText && (
                      <button
                        className="ghost-button"
                        style={{ height: 26, minHeight: 26, padding: '0 8px', fontSize: 10 }}
                        onClick={() => setExpandedId(isExpanded ? null : application.id)}
                        data-testid={`button-toggle-pitch-${application.id}`}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Hide Pitch' : 'View Pitch'}
                      </button>
                    )}
                    <button
                      className="ghost-button"
                      style={{ height: 26, minHeight: 26, padding: '0 6px', fontSize: 10, color: 'hsl(0 70% 60%)' }}
                      onClick={() => handleDelete(application.id)}
                      disabled={deletingId === application.id}
                      title="Untrack application"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="application-date">
                    {application.assignedAt
                      ? `Assigned ${timeAgo(application.assignedAt)}`
                      : `Applied ${timeAgo(application.appliedAt)}`}
                  </div>
                </div>
                {isExpanded && application.proposalText && (
                  <div style={{ padding: '0 0 14px' }}>
                    <div className="proposal-collapsible">
                      <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', marginBottom: 4, color: 'hsl(var(--primary))' }}>
                        Submitted Application Pitch
                      </div>
                      {application.proposalText}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function IssueSkeleton() {
  return (
    <div className="issue-list">
      {[1, 2, 3].map((item) => (
        <div className="issue-row" key={item}>
          <div>
            <div className="skeleton" style={{ width: '30%', height: 10 }} />
            <div className="skeleton" style={{ width: '74%', height: 17, marginTop: 12 }} />
            <div className="skeleton" style={{ width: '90%', height: 10, marginTop: 9 }} />
          </div>
          <div className="skeleton" style={{ width: 65, height: 18 }} />
        </div>
      ))}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="activity-list">
      {[1, 2, 3].map((item) => (
        <div className="activity-entry" key={item}>
          <div className="skeleton" style={{ width: 28, height: 28 }} />
          <div>
            <div className="skeleton" style={{ width: '70%', height: 11 }} />
            <div className="skeleton" style={{ width: '92%', height: 9, marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueRow({ issue, tracked, onApply }: { issue: WaveIssue; tracked: boolean; onApply: () => void }) {
  return (
    <article className="issue-row" data-testid={`card-issue-${issue.id}`}>
      <div className="issue-main">
        <div className="issue-kicker">
          <span className="repo-mark">{issue.organization} / {issue.repository}</span>
          <span>·</span>
          <span>{issue.complexity} complexity</span>
          <span>·</span>
          <span>Updated {timeAgo(issue.updatedAt)}</span>
        </div>
        <a href={issue.url} target="_blank" rel="noreferrer" className="issue-title" data-testid={`link-issue-${issue.id}`}>
          {issue.title} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: '-1px' }} />
        </a>
        <p className="issue-summary">{issue.summary || 'No summary supplied. Click to inspect requirements and apply.'}</p>
        <div className="tag-row">
          {issue.matchedSkills.map((skill) => (
            <span className="tag" key={skill}>{skill}</span>
          ))}
          <span className="tag neutral">{issue.applicants} applicants</span>
        </div>
      </div>
      <div className="issue-side">
        <div className="score">
          <span className="score-line"><span style={{ width: `${issue.matchScore}%` }} /></span>
          {issue.matchScore}%
        </div>
        <div className="points">{issue.points} pts</div>
        <div className="applicants">{issue.status === 'open' ? '🟢 Open Spot' : issue.status}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="primary-button"
            onClick={onApply}
            disabled={tracked}
            data-testid={`button-apply-${issue.id}`}
          >
            {tracked ? <><Check size={13} /> Active</> : <><Sparkles size={13} /> AI Apply</>}
          </button>
        </div>
      </div>
    </article>
  );
}

function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length) return <div className="empty-state" data-testid="state-empty-activity">No recent activity on the board.</div>;
  return (
    <div className="activity-list">
      {entries.slice(0, 8).map((entry) => (
        <div className="activity-entry" key={entry.id} data-testid={`activity-${entry.id}`}>
          <div className={`activity-icon ${entry.type === 'assignment' ? 'assignment' : ''}`}>
            {entry.type === 'assignment' ? <Award /> : entry.type === 'application' ? <Send /> : entry.type === 'release' ? <Clock3 /> : <RefreshCw />}
          </div>
          <div>
            <div className="activity-title">{entry.title}</div>
            <div className="activity-description">{entry.description}</div>
            <div className="activity-time">{timeAgo(entry.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplyPitchModal({ issue, onClose }: { issue: WaveIssue; onClose: () => void }) {
  const create = useCreateWaveApplication();
  const generate = useGenerateProposal();
  const settings = useGetNotificationSettings({ query: { queryKey: getGetNotificationSettingsQueryKey() } });
  const client = useQueryClient();

  const [proposal, setProposal] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(Boolean(settings.data?.dripsAuthToken));
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    // Automatically generate AI proposal on modal open
    generate.mutate(
      {
        data: {
          issueId: issue.id,
          issueTitle: issue.title,
          issueSummary: issue.summary || issue.title,
          repository: issue.repository,
          complexity: issue.complexity,
          points: issue.points,
        },
      },
      {
        onSuccess: (res) => {
          setProposal(res.proposal);
          setHasGenerated(true);
        },
      },
    );
  }, [issue.id]);

  const handleRegenerate = () => {
    generate.mutate(
      {
        data: {
          issueId: issue.id,
          issueTitle: issue.title,
          issueSummary: issue.summary || issue.title,
          repository: issue.repository,
          complexity: issue.complexity,
          points: issue.points,
        },
      },
      {
        onSuccess: (res) => {
          setProposal(res.proposal);
          setHasGenerated(true);
        },
      },
    );
  };

  const submit = () => {
    create.mutate(
      {
        data: {
          issueId: issue.id,
          issueTitle: issue.title,
          repository: `${issue.organization}/${issue.repository}`,
          status: 'pending',
          proposalText: proposal,
          autoSubmitToDrips: autoSubmit,
        },
      },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getGetWaveApplicationsQueryKey() });
          client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
          client.invalidateQueries({ queryKey: getGetWaveIssuesQueryKey() });
          client.invalidateQueries({ queryKey: getGetWaveActivityQueryKey() });
          onClose();
        },
      },
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" style={{ maxWidth: 600 }}>
        <div className="modal-kicker eyebrow">AI Application Generator</div>
        <h2 id="review-title">Apply to {issue.repository}</h2>
        <p className="modal-copy">
          Review or customize the AI-generated proposal pitch tailored to this bounty issue.
        </p>

        <div className="review-card">
          <div className="issue-kicker">
            <span className="repo-mark">{issue.organization} / {issue.repository}</span>
            <span>·</span>
            <span>{issue.points} points</span>
            <span>·</span>
            <span>{issue.complexity}</span>
          </div>
          <strong>{issue.title}</strong>
          <p>{issue.summary}</p>
          <a className="ghost-button" href={issue.url} target="_blank" rel="noreferrer" data-testid="link-open-drips">
            <ExternalLink size={13} /> View Full Issue on Drips
          </a>
        </div>

        <div className="pitch-preview-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="proposal-badge">
              {generate.isPending ? 'Generating proposal…' : 'Personalized Pitch'}
            </span>
            <button
              type="button"
              className="ghost-button"
              style={{ height: 26, minHeight: 26, padding: '0 8px', fontSize: 10 }}
              onClick={handleRegenerate}
              disabled={generate.isPending}
              data-testid="button-regenerate-pitch"
            >
              <Sparkles size={11} /> {generate.isPending ? 'Writing…' : 'Regenerate'}
            </button>
          </div>
          <textarea
            className="pitch-textarea"
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            placeholder="AI proposal pitch will appear here..."
            data-testid="textarea-proposal-pitch"
          />
        </div>

        {settings.data?.dripsAuthToken && (
          <label className="confirm-row">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(e) => setAutoSubmit(e.target.checked)}
              data-testid="checkbox-auto-submit-api"
            />
            <span>Submit directly to DripWave API using saved Drips credentials</span>
          </label>
        )}

        {create.isError && (
          <div className="form-error" data-testid="text-application-error">
            Could not submit application. Check credentials in Settings and try again.
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose} data-testid="button-cancel-apply">Cancel</button>
          <button
            className="primary-button"
            disabled={!proposal || create.isPending}
            onClick={submit}
            data-testid="button-submit-application"
          >
            {create.isPending ? 'Submitting…' : autoSubmit ? 'Submit Application' : 'Track Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfilePage() {
  const profile = useGetContributorProfile({ query: { queryKey: getGetContributorProfileQueryKey() } });
  const update = useUpdateContributorProfile();
  const client = useQueryClient();

  const [form, setForm] = useState<ContributorProfile>({
    name: '',
    githubUsername: '',
    skills: [],
    repositories: [],
    minPoints: 100,
    maxOrganizationApplications: 4,
    stellarWallet: '',
    bio: '',
    pitchTemplate: '',
  });

  const [skillInput, setSkillInput] = useState('');
  const [repositoryInput, setRepositoryInput] = useState('');

  useEffect(() => {
    if (profile.data) setForm(profile.data);
  }, [profile.data]);

  const addChip = (kind: 'skills' | 'repositories') => {
    const input = kind === 'skills' ? skillInput.trim() : repositoryInput.trim();
    if (!input || form[kind].includes(input)) return;
    setForm((current) => ({ ...current, [kind]: [...current[kind], input] }));
    kind === 'skills' ? setSkillInput('') : setRepositoryInput('');
  };

  const save = () => {
    update.mutate(
      { data: form },
      {
        onSuccess: (result) => {
          client.setQueryData(getGetContributorProfileQueryKey(), result);
          client.invalidateQueries({ queryKey: getGetWaveIssuesQueryKey() });
        },
      },
    );
  };

  if (profile.isLoading) return <div className="content"><LoadingPage /></div>;
  if (profile.isError) return <div className="content"><QueryError message="Contributor profile could not be loaded." onRetry={() => profile.refetch()} /></div>;

  return (
    <div className="content">
      <PageHeading
        title="Contributor Profile"
        description="Configure your skills, GitHub username, and wallet. Wave Assistant uses this to filter opportunities and auto-generate winning pitches."
        meta={<><strong>Assignment Watch</strong><br />Linked to @{form.githubUsername || 'unconfigured'}</>}
      />
      <div className="form-layout">
        <section className="form-panel">
          <h2>Your Contribution Signal</h2>
          <p className="intro">The Auto-Pilot bot targets open issues matching any of your skills and crafts proposals highlighting your experience.</p>

          <div className="form-grid">
            <Field label="Full Name">
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                data-testid="input-profile-name"
                placeholder="e.g. Alex Rivera"
              />
            </Field>

            <Field label="GitHub Username">
              <input
                value={form.githubUsername}
                onChange={(event) => setForm({ ...form, githubUsername: event.target.value })}
                data-testid="input-profile-github"
                placeholder="e.g. alexrivera (used for assignment alerts)"
              />
            </Field>

            <Field label="Stellar Wallet Address" full>
              <input
                value={form.stellarWallet || ''}
                onChange={(event) => setForm({ ...form, stellarWallet: event.target.value })}
                data-testid="input-profile-wallet"
                placeholder="G... (Stellar public key for bounty payout routing)"
              />
            </Field>

            <Field label="Skills & Languages" full>
              <ChipEditor
                values={form.skills}
                input={skillInput}
                setInput={setSkillInput}
                add={() => addChip('skills')}
                remove={(value) => setForm({ ...form, skills: form.skills.filter((item) => item !== value) })}
                placeholder="Type skill (e.g. TypeScript, Rust, Soroban, React) and press Enter"
                testId="input-profile-skill"
              />
            </Field>

            <Field label="Target Repositories" full>
              <ChipEditor
                values={form.repositories}
                input={repositoryInput}
                setInput={setRepositoryInput}
                add={() => addChip('repositories')}
                remove={(value) => setForm({ ...form, repositories: form.repositories.filter((item) => item !== value) })}
                placeholder="owner/repo (e.g. stellar/stellar-sdk)"
                testId="input-profile-repository"
              />
            </Field>

            <Field label="Minimum Bounty Points">
              <input
                type="number"
                min="0"
                value={form.minPoints}
                onChange={(event) => setForm({ ...form, minPoints: Number(event.target.value) })}
                data-testid="input-profile-min-points"
              />
              <span className="field-hint">Only apply for issues at or above this reward.</span>
            </Field>

            <Field label="Max Applications per Org">
              <input
                type="number"
                min="1"
                value={form.maxOrganizationApplications}
                onChange={(event) => setForm({ ...form, maxOrganizationApplications: Number(event.target.value) })}
                data-testid="input-profile-max-org"
              />
              <span className="field-hint">Spread your 15 slots across organizations.</span>
            </Field>

            <Field label="Contributor Bio & Strengths" full>
              <textarea
                value={form.bio || ''}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
                placeholder="Briefly describe your experience (e.g. 5+ years building backend microservices and smart contracts). AI will use this in pitch generation."
                data-testid="textarea-profile-bio"
              />
            </Field>

            <Field label="Custom Pitch Instructions / Template" full>
              <textarea
                value={form.pitchTemplate || ''}
                onChange={(event) => setForm({ ...form, pitchTemplate: event.target.value })}
                placeholder="Optional instructions for the AI (e.g. 'Emphasize my testing rigor and 24h turnaround time')."
                data-testid="textarea-profile-pitch-template"
              />
            </Field>
          </div>

          <div className="form-actions">
            <span className="save-note">
              {update.isSuccess ? 'Profile saved successfully.' : update.isError ? 'Could not save profile.' : 'Saved profile dictates matching and proposal generation.'}
            </span>
            <button
              className="primary-button"
              onClick={save}
              disabled={update.isPending}
              data-testid="button-save-profile"
            >
              <Check size={13} /> {update.isPending ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </section>

        <aside className="info-card">
          <ShieldCheck size={20} />
          <h3>Autonomous Matching</h3>
          <p>The Auto-Pilot scanner compares each live DripWave issue with your skills and bio. Any open issue with 1+ matching skill is queued for application up to your 15-slot limit.</p>
          <div className="info-rule">
            <strong>Assignment Alerts</strong><br />
            Make sure your GitHub username is exact so the Telegram monitor can identify when an issue is assigned to you.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return <div className={`field ${full ? 'full' : ''}`}><label>{label}</label>{children}</div>;
}

function ChipEditor({ values, input, setInput, add, remove, placeholder, testId }: { values: string[]; input: string; setInput: (value: string) => void; add: () => void; remove: (value: string) => void; placeholder: string; testId: string }) {
  return (
    <div className="chip-input">
      {values.map((value) => (
        <span className="tag" key={value}>
          {value}
          <button type="button" onClick={() => remove(value)} aria-label={`Remove ${value}`} data-testid={`button-remove-${value.replaceAll('/', '-')}`}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        data-testid={testId}
      />
    </div>
  );
}

function NotificationsPage() {
  const settings = useGetNotificationSettings({ query: { queryKey: getGetNotificationSettingsQueryKey() } });
  const update = useUpdateNotificationSettings();
  const testNotification = useTestNotification();
  const client = useQueryClient();

  const [form, setForm] = useState<NotificationSettings>({
    telegramEnabled: false,
    assignmentAlertsEnabled: true,
    telegramChatId: '',
    telegramBotToken: '',
    dripsAuthToken: '',
    aiApiKey: '',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
    autopilotEnabled: false,
    autopilotIntervalMinutes: 3,
    lastAutopilotRunAt: null,
    lastAutopilotStatus: null,
    lastNotifiedAt: null,
  });

  const [showDripsToken, setShowDripsToken] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const handleSyncDripWave = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/wave/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(data.message || 'Synced successfully with DripWave!');
        client.invalidateQueries({ queryKey: getGetContributorProfileQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveApplicationsQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveActivityQueryKey() });
      } else {
        setSyncMessage(data.error || 'Failed to sync with DripWave.');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSyncMessage(errorMsg || 'Network error syncing with DripWave.');
    } finally {
      setIsSyncing(false);
    }
  };

  const save = () => {
    update.mutate(
      {
        data: {
          telegramEnabled: form.telegramEnabled,
          assignmentAlertsEnabled: form.assignmentAlertsEnabled,
          telegramChatId: form.telegramChatId || null,
          telegramBotToken: form.telegramBotToken || null,
          dripsAuthToken: form.dripsAuthToken || null,
          aiApiKey: form.aiApiKey || null,
          aiProvider: form.aiProvider,
          aiModel: form.aiModel,
          autopilotEnabled: form.autopilotEnabled,
          autopilotIntervalMinutes: form.autopilotIntervalMinutes,
        },
      },
      {
        onSuccess: (result) => {
          client.setQueryData(getGetNotificationSettingsQueryKey(), result);
          client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
          client.invalidateQueries({ queryKey: getGetContributorProfileQueryKey() });
          client.invalidateQueries({ queryKey: getGetWaveApplicationsQueryKey() });
        },
      },
    );
  };

  const sendTest = () => {
    if (!form.telegramChatId) return;
    testNotification.mutate({
      data: {
        chatId: form.telegramChatId,
        botToken: form.telegramBotToken || undefined,
      },
    });
  };

  if (settings.isLoading) return <div className="content"><LoadingPage /></div>;
  if (settings.isError) return <div className="content"><QueryError message="Notification settings could not be loaded." onRetry={() => settings.refetch()} /></div>;

  return (
    <div className="content">
      <PageHeading
        title="Settings & Credentials"
        description="Configure your DripWave session, AI pitch generator, Auto-Pilot automation, and Telegram assignment alerts."
        meta={<><strong>Last Notification</strong><br />{formatDate(form.lastNotifiedAt)}</>}
      />
      <div className="form-layout">
        <section className="form-panel">
          <h2>Automation & Alert Settings</h2>
          <p className="intro">Manage automated application submission, AI keys, and instant assignment notifications.</p>

          {/* Auto-Pilot Toggle */}
          <div className="toggle-row">
            <div className="toggle-copy">
              <strong>Auto-Pilot Background Automation</strong>
              <span>Automatically scan open issues, craft tailored pitches, and submit applications up to 15 slots.</span>
            </div>
            <Toggle
              on={form.autopilotEnabled}
              onChange={(value) => setForm({ ...form, autopilotEnabled: value })}
              testId="button-toggle-autopilot"
            />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Auto-Pilot Polling Interval</label>
            <select
              value={form.autopilotIntervalMinutes}
              onChange={(e) => setForm({ ...form, autopilotIntervalMinutes: Number(e.target.value) })}
              data-testid="select-autopilot-interval"
            >
              <option value="2">Every 2 Minutes (Fast)</option>
              <option value="3">Every 3 Minutes (Recommended)</option>
              <option value="5">Every 5 Minutes</option>
              <option value="10">Every 10 Minutes</option>
            </select>
          </div>

          {/* DripWave Credentials */}
          <div className="setup-box" style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Key size={14} color="hsl(var(--primary))" />
              <h4 style={{ margin: 0 }}>DripWave Session / Auth Token</h4>
            </div>
            <p>Required for the assistant to submit applications on your behalf directly to DripWave API. (Grab your Bearer token or session cookie from browser devtools on drips.network).</p>
            <div className="password-input-wrap">
              <input
                type={showDripsToken ? 'text' : 'password'}
                value={form.dripsAuthToken || ''}
                onChange={(event) => setForm({ ...form, dripsAuthToken: event.target.value })}
                placeholder="Bearer eyJ... or token string"
                data-testid="input-drips-auth-token"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowDripsToken(!showDripsToken)}
                aria-label="Toggle token visibility"
              >
                {showDripsToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="ghost-button"
                onClick={handleSyncDripWave}
                disabled={!form.dripsAuthToken || isSyncing}
                style={{ background: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}
              >
                <RefreshCw className={isSyncing ? 'animate-spin' : ''} size={13} />
                {isSyncing ? 'Syncing DripWave Account…' : 'Sync Profile & Applications from DripWave'}
              </button>
              {syncMessage && (
                <span style={{ fontSize: 12, color: 'hsl(165 40% 40%)' }}>
                  ✓ {syncMessage}
                </span>
              )}
            </div>
          </div>

          {/* AI Pitch Generator Configuration */}
          <div className="setup-box" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Sparkles size={14} color="hsl(var(--primary))" />
              <h4 style={{ margin: 0 }}>AI Proposal Pitch Generator</h4>
            </div>
            <p>Generates tailored technical proposals for each bounty issue using Gemini API or OpenAI.</p>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label>AI Provider</label>
                <select
                  value={form.aiProvider}
                  onChange={(e) => setForm({ ...form, aiProvider: e.target.value as 'gemini' | 'openai' })}
                  data-testid="select-ai-provider"
                >
                  <option value="gemini">Google Gemini (Recommended)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div className="field">
                <label>Model</label>
                <input
                  value={form.aiModel}
                  onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                  placeholder={form.aiProvider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'}
                  data-testid="input-ai-model"
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>API Key (Optional / Fallback to Built-in Engine)</label>
              <div className="password-input-wrap">
                <input
                  type={showAiKey ? 'text' : 'password'}
                  value={form.aiApiKey || ''}
                  onChange={(event) => setForm({ ...form, aiApiKey: event.target.value })}
                  placeholder="AI API Key (or leave blank to use built-in smart engine)"
                  data-testid="input-ai-api-key"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowAiKey(!showAiKey)}
                  aria-label="Toggle key visibility"
                >
                  {showAiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Telegram Settings */}
          <div style={{ marginTop: 24, borderTop: '1px solid hsl(var(--border))', paddingTop: 18 }}>
            <div className="toggle-row">
              <div className="toggle-copy">
                <strong>Connect Telegram</strong>
                <span>Deliver instant assignment alerts to your Telegram chat.</span>
              </div>
              <Toggle
                on={form.telegramEnabled}
                onChange={(value) => setForm({ ...form, telegramEnabled: value })}
                testId="button-toggle-telegram"
              />
            </div>

            <div className="toggle-row">
              <div className="toggle-copy">
                <strong>Assignment Alerts Only</strong>
                <span>Receive a notification the moment you are assigned a bounty issue.</span>
              </div>
              <Toggle
                on={form.assignmentAlertsEnabled}
                onChange={(value) => setForm({ ...form, assignmentAlertsEnabled: value })}
                testId="button-toggle-assignment-alerts"
              />
            </div>

            <div className="setup-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Send size={14} color="hsl(var(--primary))" />
                <h4 style={{ margin: 0 }}>Telegram Chat ID & Bot Token</h4>
              </div>
              <p>Enter your Telegram Chat ID (get it from @userinfobot). Optionally configure a custom Telegram Bot Token from @BotFather.</p>
              
              <div className="field" style={{ marginTop: 10 }}>
                <label>Telegram Chat ID</label>
                <input
                  value={form.telegramChatId || ''}
                  onChange={(event) => setForm({ ...form, telegramChatId: event.target.value })}
                  placeholder="e.g. 184290311"
                  data-testid="input-telegram-chat-id"
                />
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <label>Telegram Bot Token (Optional)</label>
                <div className="password-input-wrap">
                  <input
                    type={showBotToken ? 'text' : 'password'}
                    value={form.telegramBotToken || ''}
                    onChange={(event) => setForm({ ...form, telegramBotToken: event.target.value })}
                    placeholder="e.g. 7123456789:AAH..."
                    data-testid="input-telegram-bot-token"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowBotToken(!showBotToken)}
                    aria-label="Toggle token visibility"
                  >
                    {showBotToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                className="ghost-button"
                style={{ marginTop: 12 }}
                onClick={sendTest}
                disabled={!form.telegramChatId || testNotification.isPending}
                data-testid="button-test-telegram"
              >
                {testNotification.isPending ? <RefreshCw className="animate-spin" size={13} /> : <Send size={13} />}
                {testNotification.isPending ? 'Sending Test Alert…' : 'Send Test Alert to Telegram'}
              </button>

              {testNotification.data && (
                <div className="field-hint" style={{ color: 'hsl(165 40% 32%)', marginTop: 8 }} data-testid="text-telegram-test-result">
                  ✓ {testNotification.data.message}
                </div>
              )}
              {testNotification.isError && (
                <div className="form-error" data-testid="text-telegram-test-error">
                  Telegram delivery failed. Check your Chat ID and Bot Token.
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <span className="save-note">
              {update.isSuccess ? 'Settings updated.' : update.isError ? 'Could not save settings.' : 'Changes take effect immediately.'}
            </span>
            <button
              className="primary-button"
              onClick={save}
              disabled={update.isPending}
              data-testid="button-save-notifications"
            >
              <Check size={13} /> {update.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </section>

        <aside className="info-card">
          <Zap size={20} />
          <h3>Continuous Monitoring</h3>
          <p>When Auto-Pilot is enabled, Wave Assistant runs in the background even when this tab is closed. It monitors for slot openings, auto-submits customized pitches, and alerts you on Telegram when you win an assignment.</p>
          <div className="info-rule">
            <strong>Security Guarantee</strong><br />
            All tokens and keys are encrypted and stored in your local database. They are never transmitted to third parties except when directly calling DripWave, Telegram, or the AI provider.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, testId }: { on: boolean; onChange: (value: boolean) => void; testId: string }) {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      data-testid={testId}
    >
      <span />
    </button>
  );
}

function LoadingPage() {
  return (
    <div className="loading-state">
      <div className="skeleton" style={{ width: 180, height: 15, margin: '0 auto 12px' }} />
      <div className="skeleton" style={{ width: 270, height: 10, margin: '0 auto' }} />
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Shell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;