import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  GitBranch,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
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
  useGetContributorProfile,
  useGetNotificationSettings,
  useGetWaveActivity,
  useGetWaveApplications,
  useGetWaveIssues,
  useGetWaveOverview,
  useHealthCheck,
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
  const initials = profile.data?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'WA';

  return (
    <div className="app-shell noise">
      <aside className="sidebar">
        <Link href="/" className="brand" data-testid="link-brand">
          <span className="brand-mark"><Activity /></span>
          <span className="brand-name">wave assistant</span>
        </Link>
        <div className="side-label eyebrow">Control room</div>
        <nav className="nav" aria-label="Primary navigation">
          <NavLink href="/" icon={<LayoutDashboard />} label="Wave overview" active={location === '/'} testId="link-dashboard" />
          <NavLink href="/profile" icon={<UserRound />} label="Contributor profile" active={location === '/profile'} testId="link-profile" />
          <NavLink href="/notifications" icon={<Bell />} label="Notifications" active={location === '/notifications'} testId="link-notifications" />
        </nav>
        <div className="sidebar-spacer" />
        <div className="side-footer">
          <strong>Deliberate contribution</strong>
          Wave Assistant only helps you inspect the board. Every submission stays yours to review.
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" data-testid="button-open-navigation"><Menu /></button>
          <div className="topbar-title">Stellar Wave / contributor console</div>
          <div className="topbar-right">
            <div className="health" data-testid="status-health">
              <span className={`health-dot ${health.isError ? 'error' : ''}`} />
              {health.isLoading ? 'Checking connection' : health.isError ? 'Connection issue' : 'System connected'}
            </div>
            <Link href="/profile" className="avatar" data-testid="link-avatar">{initials}</Link>
          </div>
        </header>
        <main>{children}</main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <NavLink href="/" icon={<LayoutDashboard />} label="Wave" active={location === '/'} testId="mobile-link-dashboard" />
          <NavLink href="/profile" icon={<UserRound />} label="Profile" active={location === '/profile'} testId="mobile-link-profile" />
          <NavLink href="/notifications" icon={<Bell />} label="Alerts" active={location === '/notifications'} testId="mobile-link-notifications" />
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
  const overview = useGetWaveOverview({ query: { queryKey: getGetWaveOverviewQueryKey() } });
  const issueQuery = useGetWaveIssues(undefined, { query: { queryKey: getGetWaveIssuesQueryKey(), } });
  const activity = useGetWaveActivity({ query: { queryKey: getGetWaveActivityQueryKey() } });
  const applications = useGetWaveApplications({ query: { queryKey: getGetWaveApplicationsQueryKey() } });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'match' | 'points' | 'newest'>('match');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<WaveIssue | null>(null);
  const params = useMemo(() => ({ query: query || undefined, sort, onlyOpen }), [query, sort, onlyOpen]);
  const filteredIssues = useGetWaveIssues(params, { query: { queryKey: getGetWaveIssuesQueryKey(params) } });
  const data = overview.data;
  const issues = filteredIssues.data ?? issueQuery.data ?? [];
  const tracked = applications.data ?? [];
  const trackedIssueIds = new Set(tracked.map((application) => application.issueId));

  return (
    <div className="content">
      <PageHeading
        title={data?.waveLabel || 'Current wave'}
        description={data?.programName ? `${data.programName} · A considered view of what is worth your attention.` : 'Loading the current Stellar Wave board.'}
        meta={data && <><strong>Next wave ends</strong><br />{formatDate(data.nextWaveEndsAt)}</>}
      />
      {overview.isError ? <QueryError message="The wave overview could not be loaded." onRetry={() => overview.refetch()} /> : (
        <>
          <div className="metric-grid">
            <MetricCard label="Application room" value={<>{data?.availableSlots ?? '—'} <small>/ {data?.applicationLimit ?? '—'}</small></>} progress={data ? ((data.applicationLimit - data.availableSlots) / data.applicationLimit) * 100 : 0} detail={`${data?.pendingApplications ?? '—'} pending applications`} featured />
            <MetricCard label="Open issues" value={data?.openIssueCount ?? '—'} detail="matching the live board" />
            <MetricCard label="Wave budget" value={data?.rewardBudget ?? '—'} detail="available reward pool" />
            <MetricCard label="Assignments" value={data?.assignmentCount ?? '—'} detail={data?.lastSyncedAt ? `Last sync ${timeAgo(data.lastSyncedAt)}` : 'Awaiting sync'} />
          </div>
          <div className="section-grid">
            <section className="panel" data-testid="panel-issue-board">
              <div className="panel-header">
                <div><div className="panel-title">Issues worth a look</div><div className="panel-subtitle">Ranked against your profile, not a promise of fit.</div></div>
                <div className="panel-actions"><span className="status-chip"><span />{issues.length} visible</span></div>
              </div>
              <div className="filters">
                <label className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issues or repositories" aria-label="Search issues" data-testid="input-search-issues" /></label>
                <select className="filter-select" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort issues" data-testid="select-sort-issues">
                  <option value="match">Best match</option><option value="points">Highest points</option><option value="newest">Recently updated</option>
                </select>
                <button className={`ghost-button ${onlyOpen ? 'active' : ''}`} onClick={() => setOnlyOpen((current) => !current)} data-testid="button-toggle-open"><Settings2 size={13} /> {onlyOpen ? 'Open only' : 'All status'}</button>
              </div>
              {filteredIssues.isLoading || issueQuery.isLoading ? <IssueSkeleton /> : filteredIssues.isError && !issueQuery.data ? <QueryError message="Issues could not be loaded." onRetry={() => filteredIssues.refetch()} /> : issues.length === 0 ? <div className="empty-state" data-testid="state-empty-issues">No issues match these filters. Try widening the search or checking all statuses.</div> : (
                <div className="issue-list">
                  {issues.map((issue) => <IssueRow key={issue.id} issue={issue} tracked={trackedIssueIds.has(issue.id)} onApply={() => setSelectedIssue(issue)} />)}
                </div>
              )}
            </section>
            <aside className="panel activity-panel" data-testid="panel-activity">
              <div className="panel-header"><div><div className="panel-title">Recent activity</div><div className="panel-subtitle">Signals from your wave</div></div><Activity size={16} color="hsl(var(--muted-foreground))" /></div>
              {activity.isLoading ? <ActivitySkeleton /> : activity.isError ? <QueryError message="Activity is unavailable." onRetry={() => activity.refetch()} /> : <ActivityList entries={activity.data ?? []} />}
            </aside>
          </div>
          <ApplicationsPanel applications={tracked} />
        </>
      )}
      {selectedIssue && <ReviewModal issue={selectedIssue} onClose={() => setSelectedIssue(null)} />}
    </div>
  );
}

function ApplicationsPanel({ applications }: { applications: WaveApplication[] }) {
  return (
    <section className="panel applications-panel" data-testid="panel-applications">
      <div className="panel-header">
        <div><div className="panel-title">Your tracked applications</div><div className="panel-subtitle">A small ledger for the slots you chose to spend.</div></div>
        <span className="status-chip"><Users size={11} /> {applications.length} tracked</span>
      </div>
      {!applications.length ? <div className="empty-state" data-testid="state-empty-applications">Nothing tracked yet. Use Review on Drips on an issue when you are ready to review and apply manually.</div> : (
        <div className="application-table">
          {applications.slice(0, 6).map((application) => <div className="application-row" key={application.id} data-testid={`application-${application.id}`}><div><strong>{application.issueTitle}</strong><span>{application.repository}</span></div><div className={`status-chip ${application.status}`}><span />{application.status}</div><div className="application-date">{application.assignedAt ? `Assigned ${timeAgo(application.assignedAt)}` : `Tracked ${timeAgo(application.appliedAt)}`}</div></div>)}
        </div>
      )}
    </section>
  );
}

function IssueSkeleton() {
  return <div className="issue-list">{[1, 2, 3].map((item) => <div className="issue-row" key={item}><div><div className="skeleton" style={{ width: '30%', height: 10 }} /><div className="skeleton" style={{ width: '74%', height: 17, marginTop: 12 }} /><div className="skeleton" style={{ width: '90%', height: 10, marginTop: 9 }} /></div><div className="skeleton" style={{ width: 65, height: 18 }} /></div>)}</div>;
}

function ActivitySkeleton() {
  return <div className="activity-list">{[1, 2, 3].map((item) => <div className="activity-entry" key={item}><div className="skeleton" style={{ width: 28, height: 28 }} /><div><div className="skeleton" style={{ width: '70%', height: 11 }} /><div className="skeleton" style={{ width: '92%', height: 9, marginTop: 8 }} /></div></div>)}</div>;
}

function IssueRow({ issue, tracked, onApply }: { issue: WaveIssue; tracked: boolean; onApply: () => void }) {
  return (
    <article className="issue-row" data-testid={`card-issue-${issue.id}`}>
      <div className="issue-main">
        <div className="issue-kicker"><span className="repo-mark">{issue.organization} / {issue.repository}</span><span>·</span><span>{issue.complexity}</span><span>·</span><span>{timeAgo(issue.updatedAt)}</span></div>
        <a href={issue.url} target="_blank" rel="noreferrer" className="issue-title" data-testid={`link-issue-${issue.id}`}>{issue.title} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /></a>
        <p className="issue-summary">{issue.summary || 'No summary supplied. Open the issue to understand the requested change before deciding.'}</p>
        <div className="tag-row">{issue.matchedSkills.map((skill) => <span className="tag" key={skill}>{skill}</span>)}<span className="tag neutral">{issue.applicants} watching</span></div>
      </div>
      <div className="issue-side">
        <div className="score"><span className="score-line"><span style={{ width: `${issue.matchScore}%` }} /></span>{issue.matchScore}%</div>
        <div className="points">{issue.points} pts</div>
        <div className="applicants">{issue.status === 'open' ? 'Open for review' : issue.status}</div>
        <button className="primary-button" onClick={onApply} disabled={tracked} data-testid={`button-apply-${issue.id}`}>{tracked ? <><Check size={13} /> Tracked</> : 'Review on Drips'}</button>
      </div>
    </article>
  );
}

function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length) return <div className="empty-state" data-testid="state-empty-activity">Nothing has changed on the board yet.</div>;
  return <div className="activity-list">{entries.slice(0, 6).map((entry) => <div className="activity-entry" key={entry.id} data-testid={`activity-${entry.id}`}><div className={`activity-icon ${entry.type === 'assignment' ? 'assignment' : ''}`}>{entry.type === 'assignment' ? <Check /> : entry.type === 'application' ? <Send /> : entry.type === 'sync' ? <RefreshCw /> : <Clock3 />}</div><div><div className="activity-title">{entry.title}</div><div className="activity-description">{entry.description}</div><div className="activity-time">{timeAgo(entry.createdAt)}</div></div></div>)}</div>;
}

function ReviewModal({ issue, onClose }: { issue: WaveIssue; onClose: () => void }) {
  const create = useCreateWaveApplication();
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const submit = () => {
    create.mutate({ data: { issueId: issue.id, issueTitle: issue.title, repository: `${issue.organization}/${issue.repository}`, status: 'pending' } }, {
      onSuccess: () => {
        client.invalidateQueries({ queryKey: getGetWaveApplicationsQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveOverviewQueryKey() });
        client.invalidateQueries({ queryKey: getGetWaveIssuesQueryKey() });
        onClose();
      },
    });
  };
  return <div className="modal-backdrop" role="presentation"><div className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="modal-kicker eyebrow">Manual review required</div><h2 id="review-title">Review on Drips, then track it here</h2><p className="modal-copy">Wave Assistant opens the Drips issue in a new tab. It cannot see your Drips or GitHub session and never submits an application for you.</p><div className="review-card"><div className="issue-kicker"><span className="repo-mark">{issue.organization} / {issue.repository}</span><span>·</span><span>{issue.points} points</span></div><strong>{issue.title}</strong><p>{issue.summary || 'Review the full issue, contribution rules, and acceptance criteria on Drips.'}</p><a className="ghost-button" href={issue.url} target="_blank" rel="noreferrer" data-testid="link-open-drips"><ExternalLink size={13} /> Open issue on Drips</a></div><label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} data-testid="input-confirm-manual-review" /><span>I reviewed the issue and submitted the application myself on Drips. Track it here.</span></label>{create.isError && <div className="form-error" data-testid="text-application-error">Could not track this application. Try again.</div>}<div className="modal-actions"><button className="ghost-button" onClick={onClose} data-testid="button-cancel-apply">Cancel</button><button className="primary-button" disabled={!confirmed || create.isPending} onClick={submit} data-testid="button-submit-application">{create.isPending ? 'Tracking…' : 'I submitted manually — track it'}</button></div></div></div>;
}

function ProfilePage() {
  const profile = useGetContributorProfile({ query: { queryKey: getGetContributorProfileQueryKey() } });
  const update = useUpdateContributorProfile();
  const client = useQueryClient();
  const [form, setForm] = useState<ContributorProfile>({ name: '', githubUsername: '', skills: [], repositories: [], minPoints: 0, maxOrganizationApplications: 1 });
  const [skillInput, setSkillInput] = useState('');
  const [repositoryInput, setRepositoryInput] = useState('');
  useEffect(() => { if (profile.data) setForm(profile.data); }, [profile.data]);
  const addChip = (kind: 'skills' | 'repositories') => {
    const input = kind === 'skills' ? skillInput.trim() : repositoryInput.trim();
    if (!input || form[kind].includes(input)) return;
    setForm((current) => ({ ...current, [kind]: [...current[kind], input] }));
    kind === 'skills' ? setSkillInput('') : setRepositoryInput('');
  };
  const save = () => update.mutate({ data: form }, { onSuccess: (result) => { client.setQueryData(getGetContributorProfileQueryKey(), result); } });
  if (profile.isLoading) return <div className="content"><LoadingPage /></div>;
  if (profile.isError) return <div className="content"><QueryError message="Your contributor profile could not be loaded." onRetry={() => profile.refetch()} /></div>;
  return <div className="content"><PageHeading title="Contributor profile" description="Shape the signal. Your preferences decide which open issues rise to the top." meta={<><strong>Matching mode</strong><br />Profile-based only</>} /><div className="form-layout"><section className="form-panel"><h2>Your contribution signal</h2><p className="intro">Keep this honest and current. Wave Assistant uses it to sort the public board; it does not apply on your behalf.</p><div className="setup-box"><h4>Drips account access</h4><p>Issue discovery uses Drips' public Wave feed. Your private Drips application history is not connected to this assistant. Sign in on Drips when you are ready to review or submit an application.</p><a className="ghost-button" href="https://www.drips.network/wave/login" target="_blank" rel="noreferrer" data-testid="link-drips-sign-in"><ExternalLink size={13} /> Open Drips sign-in</a></div><div className="form-grid"><Field label="Name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-profile-name" /></Field><Field label="GitHub username"><input value={form.githubUsername} onChange={(event) => setForm({ ...form, githubUsername: event.target.value })} data-testid="input-profile-github" /></Field><Field label="Skills" full><ChipEditor values={form.skills} input={skillInput} setInput={setSkillInput} add={() => addChip('skills')} remove={(value) => setForm({ ...form, skills: form.skills.filter((item) => item !== value) })} placeholder="Type a skill and press Enter" testId="input-profile-skill" /></Field><Field label="Repositories you know" full><ChipEditor values={form.repositories} input={repositoryInput} setInput={setRepositoryInput} add={() => addChip('repositories')} remove={(value) => setForm({ ...form, repositories: form.repositories.filter((item) => item !== value) })} placeholder="owner/repository" testId="input-profile-repository" /></Field><Field label="Minimum points"><input type="number" min="0" value={form.minPoints} onChange={(event) => setForm({ ...form, minPoints: Number(event.target.value) })} data-testid="input-profile-min-points" /><span className="field-hint">Only surface issues at or above this reward.</span></Field><Field label="Max applications per organization"><input type="number" min="1" value={form.maxOrganizationApplications} onChange={(event) => setForm({ ...form, maxOrganizationApplications: Number(event.target.value) })} data-testid="input-profile-max-org" /><span className="field-hint">A guardrail for spreading your 15 slots.</span></Field></div><div className="form-actions"><span className="save-note">{update.isSuccess ? 'Profile saved.' : update.isError ? 'Could not save profile.' : 'Changes affect your next issue sync.'}</span><button className="primary-button" onClick={save} disabled={update.isPending} data-testid="button-save-profile"><Check size={13} /> {update.isPending ? 'Saving…' : 'Save profile'}</button></div></section><aside className="info-card"><ShieldCheck size={19} /><h3>Use the signal, keep the judgment</h3><p>Matched skills are a starting point, not a recommendation to apply. Read the full issue and the Drips Wave rules every time.</p><div className="info-rule">Good profile hygiene makes the 15-slot limit feel intentional: fewer, better-informed applications.</div></aside></div></div>;
}

function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) { return <div className={`field ${full ? 'full' : ''}`}><label>{label}</label>{children}</div>; }

function ChipEditor({ values, input, setInput, add, remove, placeholder, testId }: { values: string[]; input: string; setInput: (value: string) => void; add: () => void; remove: (value: string) => void; placeholder: string; testId: string }) {
  return <div className="chip-input">{values.map((value) => <span className="tag" key={value}>{value}<button type="button" onClick={() => remove(value)} aria-label={`Remove ${value}`} data-testid={`button-remove-${value.replaceAll('/', '-')}`}>×</button></span>)}<input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} data-testid={testId} /></div>;
}

function NotificationsPage() {
  const settings = useGetNotificationSettings({ query: { queryKey: getGetNotificationSettingsQueryKey() } });
  const update = useUpdateNotificationSettings();
  const testNotification = useTestNotification();
  const client = useQueryClient();
  const [form, setForm] = useState<NotificationSettings>({ telegramEnabled: false, assignmentAlertsEnabled: false, telegramChatId: '', lastNotifiedAt: null });
  useEffect(() => { if (settings.data) setForm(settings.data); }, [settings.data]);
  const save = () => update.mutate({ data: { telegramEnabled: form.telegramEnabled, assignmentAlertsEnabled: form.assignmentAlertsEnabled, telegramChatId: form.telegramChatId || null } }, { onSuccess: (result) => client.setQueryData(getGetNotificationSettingsQueryKey(), result) });
  const sendTest = () => {
    if (!form.telegramChatId) return;
    testNotification.mutate({ data: { chatId: form.telegramChatId } });
  };
  if (settings.isLoading) return <div className="content"><LoadingPage /></div>;
  if (settings.isError) return <div className="content"><QueryError message="Notification settings could not be loaded." onRetry={() => settings.refetch()} /></div>;
  const ready = Boolean(form.telegramEnabled && form.telegramChatId);
  return <div className="content"><PageHeading title="Notifications" description="Get a quiet nudge when the thing you applied for is actually assigned." meta={<><strong>Last notified</strong><br />{formatDate(form.lastNotifiedAt)}</>} /><div className="form-layout"><section className="form-panel"><h2>Telegram assignment alerts</h2><p className="intro">Alerts are deliberately narrow: Wave Assistant only notifies you about tracked applications that move to assigned.</p><div className="toggle-row"><div className="toggle-copy"><strong>Connect Telegram</strong><span>Allow Wave Assistant to deliver your assignment status.</span></div><Toggle on={form.telegramEnabled} onChange={(value) => setForm({ ...form, telegramEnabled: value })} testId="button-toggle-telegram" /></div><div className="toggle-row"><div className="toggle-copy"><strong>Assignment alerts</strong><span>Notify me when one of my tracked applications is assigned.</span></div><Toggle on={form.assignmentAlertsEnabled} onChange={(value) => setForm({ ...form, assignmentAlertsEnabled: value })} testId="button-toggle-assignment-alerts" /></div><div className="setup-box"><h4>Telegram chat ID</h4><p>Paste the chat ID supplied by the Wave Assistant Telegram setup flow. It is only used for these assignment alerts.</p><input value={form.telegramChatId || ''} onChange={(event) => setForm({ ...form, telegramChatId: event.target.value })} placeholder="e.g. 184290311" data-testid="input-telegram-chat-id" /><button className="ghost-button" onClick={sendTest} disabled={!form.telegramChatId || testNotification.isPending} data-testid="button-test-telegram">{testNotification.isPending ? 'Sending test…' : 'Send test message'}</button>{testNotification.data && <div className="field-hint" data-testid="text-telegram-test-result">{testNotification.data.message}</div>}{testNotification.isError && <div className="form-error" data-testid="text-telegram-test-error">Telegram test failed. Check the chat ID and try again.</div>}</div><div className="form-actions"><span className="save-note">{ready ? 'Telegram connection looks ready.' : 'Add a chat ID to complete setup.'}</span><button className="primary-button" onClick={save} disabled={update.isPending} data-testid="button-save-notifications"><Check size={13} /> {update.isPending ? 'Saving…' : 'Save settings'}</button></div></section><aside className="info-card"><Send size={19} /><h3>{ready ? 'Alerts are ready' : 'Setup in two steps'}</h3><p>{ready ? 'The next assignment event for a tracked application can reach you here.' : 'Connect Telegram, add the chat ID from setup, then enable assignment alerts.'}</p><div className="info-rule">{form.assignmentAlertsEnabled ? 'Assignment alerts are enabled.' : 'Assignment alerts are currently off.'}<br />Last delivery: {formatDate(form.lastNotifiedAt)}</div></aside></div></div>;
}

function Toggle({ on, onChange, testId }: { on: boolean; onChange: (value: boolean) => void; testId: string }) { return <button className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} data-testid={testId}><span /></button>; }
function LoadingPage() { return <div className="loading-state"><div className="skeleton" style={{ width: 180, height: 15, margin: '0 auto 12px' }} /><div className="skeleton" style={{ width: 270, height: 10, margin: '0 auto' }} /></div>; }

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Dashboard} /><Route path="/profile" component={ProfilePage} /><Route path="/notifications" component={NotificationsPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;