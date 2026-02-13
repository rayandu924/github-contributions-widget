import { useSettings, useViewport, useOAuth, useStorage } from '@mywallpaper/sdk-react'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// ==================== Types ====================

interface Settings {
  showHeader: boolean
  showFooter: boolean
  showLabels: boolean
  showDayLabels: boolean
  showStats: boolean
  colorLevel0: string
  colorLevel1: string
  colorLevel2: string
  colorLevel3: string
  colorLevel4: string
  showBackground: boolean
  backgroundColor: string
  backgroundBlur: number
  displayMode: 'year' | 'month'
  refreshInterval: number
}

interface ContributionDay {
  contributionCount: number
  date: string
  weekday: number
}

interface ContributionWeek {
  contributionDays: ContributionDay[]
}

interface ContributionMonth {
  name: string
  firstDay: string
  totalWeeks: number
}

interface ContributionCalendar {
  totalContributions: number
  weeks: ContributionWeek[]
  months: ContributionMonth[]
}

interface ContributionsCollection {
  totalCommitContributions: number
  totalIssueContributions: number
  totalPullRequestContributions: number
  totalPullRequestReviewContributions: number
  contributionCalendar: ContributionCalendar
}

interface GitHubUser {
  login: string
  avatar_url: string
}

interface CachedData {
  user: GitHubUser
  contributions: ContributionsCollection
  year: number
  timestamp: number
}

type UIState = 'connecting' | 'loading' | 'grid' | 'error'

// ==================== Constants ====================

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const GRAPHQL_QUERY = `query($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date weekday } }
        months { name firstDay totalWeeks }
      }
    }
  }
}`

// ==================== Helpers ====================

function getContributionLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0
  const pct = count / max
  if (pct <= 0.25) return 1
  if (pct <= 0.5) return 2
  if (pct <= 0.75) return 3
  return 4
}

function formatNumber(num: number): string {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toString()
}

function filterWeeksForDisplayMode(
  weeks: ContributionWeek[],
  displayMode: 'year' | 'month',
): ContributionWeek[] {
  if (displayMode !== 'month') return weeks

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  return weeks.filter((week) =>
    week.contributionDays.some((day) => {
      const d = new Date(day.date)
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth
    }),
  )
}

// ==================== Layout Calculation ====================

interface LayoutMetrics {
  cellWidth: number
  cellHeight: number
  cellGap: number
  cellRadius: number
  labelFontSize: number
  dayLabelsWidth: number
  weekHeaderHeight: number
  headerHeight: number
  footerHeight: number
  padding: number
}

function calculateLayout(
  vpWidth: number,
  vpHeight: number,
  weeksCount: number,
  settings: Settings,
): LayoutMetrics {
  const daysCount = 7
  const showHeader = settings.showHeader !== false
  const showLabels = settings.showLabels !== false
  const showDayLabels = settings.showDayLabels !== false
  const showFooter = settings.showFooter !== false

  const padding = Math.min(8, vpWidth * 0.02, vpHeight * 0.02)
  const headerHeight = showHeader ? Math.min(40, vpHeight * 0.1) : 0
  const footerHeight = showFooter ? Math.min(24, vpHeight * 0.06) : 0

  let graphAreaWidth = Math.max(80, vpWidth - padding * 2)
  let graphAreaHeight = Math.max(40, vpHeight - padding * 2 - headerHeight - footerHeight)

  const smallestDim = Math.min(graphAreaWidth / weeksCount, graphAreaHeight / daysCount)
  let gap = Math.max(1, Math.round(smallestDim * 0.12))

  const rawCellWidth = (graphAreaWidth - (weeksCount - 1) * gap) / weeksCount
  const rawCellHeight = (graphAreaHeight - (daysCount - 1) * gap) / daysCount
  const cellMin = Math.min(rawCellWidth, rawCellHeight)

  const dayLabelsWidth = showDayLabels ? Math.max(12, Math.floor(cellMin * 1.2)) : 0
  const weekHeaderHeight = showLabels ? Math.max(8, Math.floor(rawCellHeight * 0.7)) : 0

  graphAreaWidth -= dayLabelsWidth
  graphAreaHeight -= weekHeaderHeight

  let cellWidth = (graphAreaWidth - (weeksCount - 1) * gap) / weeksCount
  let cellHeight = (graphAreaHeight - (daysCount - 1) * gap) / daysCount

  cellWidth = Math.floor(Math.max(2, Math.min(80, cellWidth)))
  cellHeight = Math.floor(Math.max(2, Math.min(80, cellHeight)))
  gap = Math.max(1, Math.floor(gap))

  const minDim = Math.min(cellWidth, cellHeight)
  const cellRadius = Math.max(1, Math.round(minDim * 0.15))
  const labelFontSize = Math.max(6, Math.min(14, Math.round(minDim * 0.6)))

  return {
    cellWidth,
    cellHeight,
    cellGap: gap,
    cellRadius,
    labelFontSize,
    dayLabelsWidth,
    weekHeaderHeight,
    headerHeight,
    footerHeight,
    padding,
  }
}

// ==================== Tooltip Component ====================

interface TooltipProps {
  count: number
  date: string
  x: number
  y: number
}

function Tooltip({ count, date, x, y }: TooltipProps) {
  const formatted = new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return (
    <div
      style={{
        position: 'fixed',
        left: x + 10,
        top: y - 30,
        padding: '4px 8px',
        background: '#1c2128',
        border: '1px solid #30363d',
        borderRadius: 4,
        fontSize: 10,
        color: '#f0f6fc',
        pointerEvents: 'none',
        zIndex: 1000,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight: 700 }}>
        {count} contribution{count !== 1 ? 's' : ''}
      </span>
      <span style={{ color: '#8b949e', marginLeft: 3 }}>on {formatted}</span>
    </div>
  )
}

// ==================== Sub-components ====================

interface DayCellProps {
  day: ContributionDay
  level: number
  colorLevels: string[]
  cellWidth: number
  cellHeight: number
  cellRadius: number
  animDelay: number
  onHover: (day: ContributionDay, e: React.MouseEvent) => void
  onMove: (e: React.MouseEvent) => void
  onLeave: () => void
}

function DayCell({
  day,
  level,
  colorLevels,
  cellWidth,
  cellHeight,
  cellRadius,
  animDelay,
  onHover,
  onMove,
  onLeave,
}: DayCellProps) {
  return (
    <div
      style={{
        width: cellWidth,
        height: cellHeight,
        borderRadius: cellRadius,
        background: colorLevels[level],
        cursor: 'pointer',
        flexShrink: 0,
        opacity: 0,
        animation: `fadeIn 0.3s ease forwards`,
        animationDelay: `${animDelay}ms`,
        transition: 'opacity 0.1s',
      }}
      onMouseEnter={(e) => onHover(day, e)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    />
  )
}

// ==================== Main Widget ====================

export default function GitHubContributionsWidget() {
  const settings = useSettings<Settings>()
  const { width: vpWidth, height: vpHeight } = useViewport()
  const { request, isConnected } = useOAuth()
  const storage = useStorage()

  const [uiState, setUIState] = useState<UIState>('connecting')
  const [errorTitle, setErrorTitle] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [contributions, setContributions] = useState<ContributionsCollection | null>(null)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())

  const [tooltip, setTooltip] = useState<TooltipProps | null>(null)

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const colorLevels = useMemo(
    () => [
      settings.colorLevel0 || '#161b22',
      settings.colorLevel1 || '#0e4429',
      settings.colorLevel2 || '#006d32',
      settings.colorLevel3 || '#26a641',
      settings.colorLevel4 || '#39d353',
    ],
    [
      settings.colorLevel0,
      settings.colorLevel1,
      settings.colorLevel2,
      settings.colorLevel3,
      settings.colorLevel4,
    ],
  )

  // ---- Data fetching ----

  const fetchUserProfile = useCallback(async (): Promise<GitHubUser> => {
    const res = await request('github', '/user', {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    return res.data as GitHubUser
  }, [request])

  const fetchContributions = useCallback(
    async (username: string, year: number): Promise<ContributionsCollection> => {
      const fromDate = `${year}-01-01T00:00:00Z`
      const toDate = `${year}-12-31T23:59:59Z`

      const res = await request('github', '/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: {
          query: GRAPHQL_QUERY,
          variables: { username, from: fromDate, to: toDate },
        },
      })

      const gql = res.data as {
        errors?: { message: string }[]
        data: { user: { contributionsCollection: ContributionsCollection } }
      }

      if (gql.errors?.length) {
        throw new Error(gql.errors[0].message || 'GraphQL query failed')
      }

      return gql.data.user.contributionsCollection
    },
    [request],
  )

  const loadData = useCallback(async () => {
    try {
      setUIState('loading')

      const year = currentYear

      // Check cache
      const cached = await storage.get<CachedData>('contributionData')
      if (cached && cached.year === year && Date.now() - cached.timestamp < (settings.refreshInterval || 30) * 60 * 1000) {
        setUser(cached.user)
        setContributions(cached.contributions)
        setUIState('grid')
        return
      }

      const userProfile = await fetchUserProfile()
      const contribs = await fetchContributions(userProfile.login, year)

      setUser(userProfile)
      setContributions(contribs)
      setUIState('grid')

      // Cache
      await storage.set('contributionData', {
        user: userProfile,
        contributions: contribs,
        year,
        timestamp: Date.now(),
      } as CachedData)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setErrorTitle('Failed to Load Data')
      setErrorMessage(msg)
      setUIState('error')
    }
  }, [currentYear, settings.refreshInterval, storage, fetchUserProfile, fetchContributions])

  // ---- Init: check OAuth and load ----

  useEffect(() => {
    let cancelled = false

    async function init() {
      setUIState('connecting')
      const connected = await isConnected('github')
      if (cancelled) return
      if (!connected) {
        setUIState('connecting')
        return
      }
      await loadData()
    }

    init()
    return () => {
      cancelled = true
    }
  }, [isConnected, loadData])

  // ---- Refresh timer ----

  useEffect(() => {
    if (uiState !== 'grid') return

    const interval = (settings.refreshInterval || 30) * 60 * 1000
    refreshTimerRef.current = setInterval(() => {
      loadData()
    }, interval)

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [uiState, settings.refreshInterval, loadData])

  // ---- Reload when year changes via settings ----

  useEffect(() => {
    setCurrentYear(new Date().getFullYear())
  }, [])

  // ---- Layout calculation ----

  const displayMode = settings.displayMode || 'year'
  const allWeeks = contributions?.contributionCalendar.weeks ?? []
  const weeks = useMemo(() => filterWeeksForDisplayMode(allWeeks, displayMode), [allWeeks, displayMode])
  const weeksCount = weeks.length || 53

  const layout = useMemo(
    () => calculateLayout(vpWidth, vpHeight, weeksCount, settings),
    [vpWidth, vpHeight, weeksCount, settings],
  )

  // ---- Max contributions for level computation ----

  const maxContributions = useMemo(() => {
    let max = 0
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        if (day.contributionCount > max) max = day.contributionCount
      }
    }
    return max
  }, [weeks])

  // ---- Month labels ----

  const monthHeaders = useMemo(() => {
    if (!contributions || settings.showLabels === false) return new Map<number, string>()

    const months = contributions.contributionCalendar.months
    const headers = new Map<number, string>()
    let currentMonthIndex = 0
    let weekInMonth = 0

    if (displayMode === 'month' && weeks.length > 0) {
      const firstDayDate = new Date(weeks[0].contributionDays[0].date)
      const firstMonth = firstDayDate.getMonth()
      const idx = months.findIndex((m) => {
        const shortName = new Date(2024, firstMonth, 1)
          .toLocaleDateString('en', { month: 'short' })
          .toLowerCase()
        return m.name.toLowerCase().startsWith(shortName)
      })
      currentMonthIndex = idx === -1 ? 0 : idx
    }

    for (let wi = 0; wi < weeks.length; wi++) {
      if (months[currentMonthIndex]) {
        const month = months[currentMonthIndex]
        if (weekInMonth === 0) {
          headers.set(wi, month.name.substring(0, 3))
        }
        weekInMonth++
        if (weekInMonth >= month.totalWeeks) {
          currentMonthIndex++
          weekInMonth = 0
        }
      }
    }

    return headers
  }, [contributions, weeks, displayMode, settings.showLabels])

  // ---- Tooltip handlers ----

  const handleDayHover = useCallback((day: ContributionDay, e: React.MouseEvent) => {
    setTooltip({ count: day.contributionCount, date: day.date, x: e.clientX, y: e.clientY })
  }, [])

  const handleDayMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null))
  }, [])

  const handleDayLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  // ---- Retry handler ----

  const handleRetry = useCallback(async () => {
    const connected = await isConnected('github')
    if (connected) {
      await loadData()
    }
  }, [isConnected, loadData])

  // ---- CSS keyframes (injected once) ----

  const keyframesStyle = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`

  // ==================== Render ====================

  // -- Connecting state --
  if (uiState === 'connecting') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          textAlign: 'center',
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 32 }}>&#x1F510;</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>GitHub Access Required</div>
        <div style={{ fontSize: 11, color: '#8b949e' }}>Reinstall and grant access</div>
      </div>
    )
  }

  // -- Loading state --
  if (uiState === 'loading') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          textAlign: 'center',
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            border: '2px solid #30363d',
            borderTopColor: '#238636',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>Loading...</div>
        <div style={{ fontSize: 11, color: '#8b949e' }}>Fetching your GitHub data...</div>
      </div>
    )
  }

  // -- Error state --
  if (uiState === 'error') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          textAlign: 'center',
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 32, color: '#f85149' }}>&#x26A0;&#xFE0F;</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>{errorTitle}</div>
        <div style={{ fontSize: 11, color: '#8b949e' }}>{errorMessage}</div>
        <button
          onClick={handleRetry}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            border: '1px solid #30363d',
            background: '#21262d',
            color: '#c9d1d9',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  // -- Grid state --
  const {
    cellWidth,
    cellHeight,
    cellGap,
    cellRadius,
    labelFontSize,
    dayLabelsWidth,
    weekHeaderHeight,
    headerHeight,
    footerHeight,
    padding,
  } = layout

  const showHeader = settings.showHeader !== false
  const showFooter = settings.showFooter !== false
  const showDayLabels = settings.showDayLabels !== false
  const showStats = settings.showStats !== false

  const bgStyle: React.CSSProperties = settings.showBackground
    ? {
        background: settings.backgroundColor || 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
        backdropFilter: `blur(${settings.backgroundBlur ?? 10}px)`,
        WebkitBackdropFilter: `blur(${settings.backgroundBlur ?? 10}px)`,
      }
    : { background: 'transparent' }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding,
        boxSizing: 'border-box',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#c9d1d9',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{keyframesStyle}</style>

      {/* Background layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          ...bgStyle,
        }}
      />

      {/* Header */}
      {showHeader && user && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            height: headerHeight,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <img
              src={user.avatar_url}
              alt=""
              style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: labelFontSize, color: '#c9d1d9' }}>
                {user.login}
              </div>
              <div style={{ fontSize: labelFontSize * 0.8, color: '#8b949e' }}>{currentYear}</div>
            </div>
          </div>

          {showFooter && showStats && contributions && (
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: contributions.totalCommitContributions, label: 'commits' },
                { value: contributions.totalPullRequestContributions, label: 'PRs' },
                { value: contributions.totalIssueContributions, label: 'issues' },
                { value: contributions.contributionCalendar.totalContributions, label: 'total' },
              ].map((stat) => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: labelFontSize, fontWeight: 600, color: '#f0f6fc' }}>
                    {formatNumber(stat.value)}
                  </span>
                  <span style={{ fontSize: labelFontSize * 0.7, color: '#8b949e' }}>
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Graph wrapper */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          {/* Day labels */}
          {showDayLabels && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: cellGap,
                width: dayLabelsWidth,
                flexShrink: 0,
                paddingTop: weekHeaderHeight,
              }}
            >
              {DAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  style={{
                    height: cellHeight,
                    fontSize: labelFontSize,
                    color: '#8b949e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 3,
                    visibility: i % 2 === 1 ? 'hidden' : 'visible',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          )}

          {/* Graph grid */}
          <div style={{ display: 'flex', gap: cellGap, flex: 1 }}>
            {weeks.map((week, wi) => (
              <div
                key={wi}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: cellGap,
                  flex: 1,
                }}
              >
                {/* Month header */}
                <div
                  style={{
                    height: weekHeaderHeight,
                    fontSize: labelFontSize,
                    color: '#8b949e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {monthHeaders.get(wi) || ''}
                </div>

                {/* Day cells */}
                {week.contributionDays.map((day, di) => {
                  const level = getContributionLevel(day.contributionCount, maxContributions)
                  const delay = (wi * 7 + di) * 3
                  return (
                    <DayCell
                      key={day.date}
                      day={day}
                      level={level}
                      colorLevels={colorLevels}
                      cellWidth={cellWidth}
                      cellHeight={cellHeight}
                      cellRadius={cellRadius}
                      animDelay={delay}
                      onHover={handleDayHover}
                      onMove={handleDayMove}
                      onLeave={handleDayLeave}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer (Legend) */}
      {showFooter && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            height: footerHeight,
            flexShrink: 0,
            fontSize: labelFontSize,
            color: '#8b949e',
          }}
        >
          <span>Less</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {colorLevels.map((color, i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                }}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && <Tooltip {...tooltip} />}
    </div>
  )
}
