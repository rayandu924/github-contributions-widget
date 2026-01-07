/**
 * GitHub Contributions Widget
 * Uses MyWallpaper SDK for OAuth, network proxy, and storage
 *
 * Security: Uses safe DOM methods (createElement, textContent) instead of innerHTML
 */
(function () {
  'use strict';

  // ==================== State Management ====================
  var state = {
    user: null,
    contributions: null,
    year: new Date().getFullYear(),
    refreshTimer: null,
    isConnected: false,
    hasRequiredScopes: false,
    hasStoragePermission: false,
    weeksCount: 53, // New: track actual week count for scaling
    scalingHandle: null // Handle for the SDK scaling utility
  };

  // ==================== DOM Elements ====================
  var elements = {
    stateAuth: document.getElementById('state-auth'),
    stateLoading: document.getElementById('state-loading'),
    stateError: document.getElementById('state-error'),
    container: document.getElementById('container'),
    header: document.querySelector('.header'),
    background: document.getElementById('background'),
    btnRetry: document.getElementById('btn-retry'),
    loadingMessage: document.getElementById('loading-message'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    avatar: document.getElementById('avatar'),
    username: document.getElementById('username'),
    yearLabel: document.getElementById('year-label'),
    stats: document.getElementById('stats'),
    dayLabels: document.getElementById('day-labels'),
    graph: document.getElementById('graph'),
    graphContainer: document.getElementById('graph-container'),
    legend: document.getElementById('legend'),
    legendSquares: document.getElementById('legend-squares'),
    tooltip: document.getElementById('tooltip'),
    tooltipCount: document.getElementById('tooltip-count'),
    tooltipDate: document.getElementById('tooltip-date')
  };

  // ==================== SDK API Reference ====================
  var api = null;

  // ==================== UI State Helpers ====================
  function showState(stateName) {
    ['stateAuth', 'stateLoading', 'stateError', 'container'].forEach(function (s) {
      var el = elements[s];
      if (el) {
        if (s === stateName) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });
  }

  function showError(title, message) {
    elements.errorTitle.textContent = title;
    elements.errorMessage.textContent = message;
    showState('stateError');
  }

  function showLoading(message) {
    elements.loadingMessage.textContent = message || 'Loading...';
    showState('stateLoading');
  }

  // ==================== DOM Helper ====================
  function clearElement(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function createElement(tag, className, textContent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
  }

  // ==================== Styling & Layout ====================
  function applyVisuals(config) {
    // 1. Background
    if (config.showBackground) {
      elements.background.style.background = config.backgroundColor || 'var(--bg)';
      elements.background.style.backdropFilter = 'blur(' + (config.backgroundBlur || 10) + 'px)';
      elements.background.style.webkitBackdropFilter = 'blur(' + (config.backgroundBlur || 10) + 'px)';
    } else {
      elements.background.style.background = 'transparent';
      elements.background.style.backdropFilter = 'none';
      elements.background.style.webkitBackdropFilter = 'none';
    }

    // 2. Element Visibility
    elements.dayLabels.style.display = config.showDayLabels !== false ? 'flex' : 'none';
    elements.header.style.display = config.showHeader !== false ? 'flex' : 'none';

    // Footer handling (Legend + Stats)
    var showFooter = config.showFooter !== false;
    elements.legend.style.display = showFooter ? 'flex' : 'none';
    elements.stats.style.display = (showFooter && config.showStats !== false) ? 'flex' : 'none';

    renderLegendSquares();
  }

  // ==================== GitHub API ====================
  async function fetchUserProfile() {
    var response = await api.oauth.request('github', '/user', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (response.error || !response.ok) {
      throw new Error('GitHub API error: ' + (response.error || response.status));
    }
    return response.data;
  }

  async function fetchContributions(username, year) {
    var query = 'query($username: String!, $from: DateTime!, $to: DateTime!) { ' +
      'user(login: $username) { ' +
      'contributionsCollection(from: $from, to: $to) { ' +
      'totalCommitContributions ' +
      'totalIssueContributions ' +
      'totalPullRequestContributions ' +
      'totalPullRequestReviewContributions ' +
      'contributionCalendar { ' +
      'totalContributions ' +
      'weeks { contributionDays { contributionCount date weekday } } ' +
      'months { name firstDay totalWeeks } ' +
      '} ' +
      '} ' +
      '} ' +
      '}';

    var fromDate = year + '-01-01T00:00:00Z';
    var toDate = year + '-12-31T23:59:59Z';

    var response = await api.oauth.request('github', '/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: {
        query: query,
        variables: { username: username, from: fromDate, to: toDate }
      }
    });

    if (response.error || !response.ok) {
      throw new Error('GitHub API error: ' + (response.error || response.status));
    }

    var data = response.data;
    if (data.errors) {
      throw new Error(data.errors[0] && data.errors[0].message || 'GraphQL query failed');
    }

    return data.data.user.contributionsCollection;
  }

  // ==================== Render Functions ====================
  function renderLegendSquares() {
    clearElement(elements.legendSquares);
    for (var i = 0; i <= 4; i++) {
      var square = createElement('div', 'legend-square');
      square.style.background = 'var(--level-' + i + ')';
      elements.legendSquares.appendChild(square);
    }
  }

  function renderDayLabels() {
    clearElement(elements.dayLabels);
    var labels = {
      en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    };
    var days = labels[api.language] || labels.en;
    days.forEach(function (day) {
      var label = createElement('div', 'day-label', day);
      elements.dayLabels.appendChild(label);
    });
  }

  function renderStats(contributions) {
    clearElement(elements.stats);
    var statsData = [
      { value: contributions.totalCommitContributions, label: 'commits' },
      { value: contributions.totalPullRequestContributions, label: 'PRs' },
      { value: contributions.totalIssueContributions, label: 'issues' },
      { value: contributions.contributionCalendar.totalContributions, label: 'total' }
    ];

    statsData.forEach(function (stat) {
      var statDiv = createElement('div', 'stat');
      var valueSpan = createElement('span', 'stat-value', formatNumber(stat.value));
      var labelSpan = createElement('span', 'stat-label', stat.label);
      statDiv.appendChild(valueSpan);
      statDiv.appendChild(labelSpan);
      elements.stats.appendChild(statDiv);
    });
  }

  function formatNumber(num) {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  }

  /**
   * Filter weeks based on displayMode setting
   * @param {Array} weeks - All weeks from contribution calendar
   * @param {string} displayMode - 'year' or 'month'
   * @returns {Array} Filtered weeks
   */
  function filterWeeksForDisplayMode(weeks, displayMode) {
    if (displayMode !== 'month') {
      return weeks; // Return all weeks for year mode
    }

    // For month mode, filter to only weeks containing days in the current month
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth(); // 0-indexed

    return weeks.filter(function (week) {
      // Check if any day in this week is in the current month
      return week.contributionDays.some(function (day) {
        var dayDate = new Date(day.date);
        return dayDate.getFullYear() === currentYear && dayDate.getMonth() === currentMonth;
      });
    });
  }

  function renderGraph(contributions, config) {
    clearElement(elements.graph);
    var calendar = contributions.contributionCalendar;
    var allWeeks = calendar.weeks;

    // Filter weeks based on display mode
    var displayMode = config.displayMode || 'year';
    var weeks = filterWeeksForDisplayMode(allWeeks, displayMode);

    state.weeksCount = weeks.length;
    state.displayMode = displayMode;

    var months = calendar.months;
    var maxContributions = 0;

    weeks.forEach(function (week) {
      week.contributionDays.forEach(function (day) {
        if (day.contributionCount > maxContributions) maxContributions = day.contributionCount;
      });
    });

    // For month mode, we need to find the correct starting month index
    var currentMonthIndex = 0;
    var weekInMonth = 0;

    if (displayMode === 'month' && weeks.length > 0) {
      // Find month index for the first displayed week
      var firstDayDate = new Date(weeks[0].contributionDays[0].date);
      var firstMonth = firstDayDate.getMonth();
      currentMonthIndex = months.findIndex(function (m) {
        return m.name.toLowerCase().startsWith(new Date(2024, firstMonth, 1).toLocaleDateString('en', { month: 'short' }).toLowerCase());
      });
      if (currentMonthIndex === -1) currentMonthIndex = 0;
    }

    weeks.forEach(function (week, weekIndex) {
      var weekDiv = createElement('div', 'week');
      var monthLabel = '';

      if (config.showLabels !== false && months[currentMonthIndex]) {
        var month = months[currentMonthIndex];
        if (weekInMonth === 0) monthLabel = month.name.substring(0, 3);
        weekInMonth++;
        if (weekInMonth >= month.totalWeeks) {
          currentMonthIndex++;
          weekInMonth = 0;
        }
      }

      var header = createElement('div', 'week-header', monthLabel);
      weekDiv.appendChild(header);

      week.contributionDays.forEach(function (day, dayIndex) {
        var level = getContributionLevel(day.contributionCount, maxContributions);
        var delay = (weekIndex * 7 + dayIndex) * 3;
        var dayDiv = createElement('div', 'day level-' + level);
        dayDiv.dataset.date = day.date;
        dayDiv.dataset.count = day.contributionCount;
        dayDiv.style.animationDelay = delay + 'ms';

        if (config.showTooltips !== false) setupDayTooltip(dayDiv);
        weekDiv.appendChild(dayDiv);
      });

      elements.graph.appendChild(weekDiv);
    });

    // Recalculate responsive layout after changing week count
    calculateAndApplyResponsiveLayout(document.body.clientWidth, document.body.clientHeight);
  }

  function getContributionLevel(count, max) {
    if (count === 0 || max === 0) return 0;
    var percentage = count / max;
    if (percentage <= 0.25) return 1;
    if (percentage <= 0.5) return 2;
    if (percentage <= 0.75) return 3;
    return 4;
  }

  function setupDayTooltip(dayDiv) {
    dayDiv.addEventListener('mouseenter', function (e) {
      var count = parseInt(dayDiv.dataset.count, 10);
      var date = new Date(dayDiv.dataset.date);
      var formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      elements.tooltipCount.textContent = count + ' contribution' + (count !== 1 ? 's' : '');
      elements.tooltipDate.textContent = 'on ' + formattedDate;
      elements.tooltip.classList.add('visible');
      updateTooltipPosition(e);
    });
    dayDiv.addEventListener('mousemove', updateTooltipPosition);
    dayDiv.addEventListener('mouseleave', function () {
      elements.tooltip.classList.remove('visible');
    });
  }

  function updateTooltipPosition(e) {
    elements.tooltip.style.left = (e.clientX + 10) + 'px';
    elements.tooltip.style.top = (e.clientY - 30) + 'px';
  }

  // ==================== Data Management ====================
  async function ensureStoragePermission() {
    if (state.hasStoragePermission) return true;
    try {
      state.hasStoragePermission = await api.requestPermission('storage', 'To cache your GitHub data');
      return state.hasStoragePermission;
    } catch (e) { return false; }
  }

  async function loadCachedData() {
    if (!state.hasStoragePermission) return null;
    try {
      var cached = await api.storage.get('contributionData');
      if (cached && (Date.now() - cached.timestamp < (api.config.refreshInterval || 30) * 60 * 1000)) return cached;
    } catch (e) { }
    return null;
  }

  async function cacheData(user, contributions, year) {
    if (!state.hasStoragePermission) return;
    try {
      await api.storage.set('contributionData', { user: user, contributions: contributions, year: year, timestamp: Date.now() });
    } catch (e) { }
  }

  // ==================== Main Flow ====================
  async function checkAuth() {
    try {
      state.isConnected = await api.oauth.isConnected('github');
      if (!state.isConnected) { showState('stateAuth'); return false; }
      var scopes = await api.oauth.getScopes('github');
      state.hasRequiredScopes = scopes.includes('read:user');
      if (!state.hasRequiredScopes) { showState('stateAuth'); return false; }
      return true;
    } catch (e) {
      showError('Authentication Error', 'Failed to check GitHub status.');
      return false;
    }
  }

  async function loadData() {
    try {
      var yearSetting = api.config.year || 'current';
      state.year = yearSetting === 'current' ? new Date().getFullYear() : parseInt(yearSetting, 10);
      showLoading('Fetching your GitHub data...');

      var cached = await loadCachedData();
      if (cached && cached.year === state.year) {
        state.user = cached.user;
        state.contributions = cached.contributions;
        renderUI();
        return;
      }

      state.user = await fetchUserProfile();
      state.contributions = await fetchContributions(state.user.login, state.year);
      await cacheData(state.user, state.contributions, state.year);
      renderUI();
    } catch (error) {
      showError('Failed to Load Data', error.message);
    }
  }

  function renderUI() {
    var config = api.config;
    applyVisuals(config);

    elements.avatar.src = state.user.avatar_url;
    elements.username.textContent = state.user.login;
    elements.yearLabel.textContent = state.year;

    renderDayLabels();
    renderStats(state.contributions);
    renderGraph(state.contributions, config);

    showState('container');
    setupRefreshTimer();
    api.renderComplete();
  }

  function setupRefreshTimer() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    var interval = (api.config.refreshInterval || 30) * 60 * 1000;
    state.refreshTimer = setInterval(async function () {
      if (state.isConnected && state.hasRequiredScopes) await loadData();
    }, interval);
  }

  // ==================== Event Handlers ====================
  function setupEventListeners() {
    elements.btnRetry.addEventListener('click', async function () {
      if (await checkAuth()) await loadData();
    });

    api.onEvent('visibility:change', function (data) {
      if (data.hidden) {
        if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
      } else if (state.isConnected && state.contributions) {
        setupRefreshTimer();
      }
    });

    window.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'SETTINGS_UPDATE') {
        var newConfig = api ? api.config : {};
        var oldDisplayMode = state.displayMode;
        var oldYear = state.year;

        applyVisuals(newConfig);

        if (state.contributions) {
          var y = newConfig.year || 'current';
          var ny = y === 'current' ? new Date().getFullYear() : parseInt(y, 10);

          // Only reload data if year changed
          if (ny !== oldYear) {
            loadData();
          }
          // Only re-render graph if structural settings changed
          else if (
            newConfig.displayMode !== oldDisplayMode ||
            newConfig.showLabels !== (elements.dayLabels.style.display !== 'none') || // approximate check
            newConfig.showDayLabels !== (elements.dayLabels.style.display !== 'none') // approximate check
          ) {
            renderGraph(state.contributions, newConfig);
          }
          // Note:Color changes (colorLevelX) are handled automatically by CSS variables
          // injected by the host, so no re-render is needed for them!
        }
      }
    });
  }

  // ==================== Responsive Layout ====================
  /**
   * Fully responsive layout - ALL sizes derived from available space
   * No fixed pixel values - everything scales proportionally
   */
  function calculateAndApplyResponsiveLayout(viewportWidth, viewportHeight) {
    var config = api ? api.config : {};
    var weeksCount = state.weeksCount || 53;
    var daysCount = 7;

    // Configuration
    var showHeader = config.showHeader !== false;
    var showLabels = config.showLabels !== false;
    var showDayLabels = config.showDayLabels !== false;
    var showFooter = config.showFooter !== false;

    // Calculate available space
    var padding = Math.min(8, viewportWidth * 0.02, viewportHeight * 0.02);
    var headerHeight = showHeader ? Math.min(40, viewportHeight * 0.1) : 0;
    var footerHeight = showFooter ? Math.min(24, viewportHeight * 0.06) : 0;

    var graphAreaWidth = viewportWidth - (padding * 2);
    var graphAreaHeight = viewportHeight - (padding * 2) - headerHeight - footerHeight;

    // Minimum sizes
    graphAreaWidth = Math.max(graphAreaWidth, 80);
    graphAreaHeight = Math.max(graphAreaHeight, 40);

    // Calculate gap as percentage of smallest dimension
    var smallestDim = Math.min(graphAreaWidth / weeksCount, graphAreaHeight / daysCount);
    var gap = Math.max(1, Math.round(smallestDim * 0.12));

    // Calculate cell dimensions to fill entire space
    // Formula: graphWidth = cells * width + (cells - 1) * gap + labels
    // We need to solve for cellWidth and cellHeight simultaneously with their dependent values

    // First pass: calculate cells assuming no labels
    var rawCellWidth = (graphAreaWidth - (weeksCount - 1) * gap) / weeksCount;
    var rawCellHeight = (graphAreaHeight - (daysCount - 1) * gap) / daysCount;

    // Calculate dependent sizes based on cell dimensions
    var cellMin = Math.min(rawCellWidth, rawCellHeight);

    // Day labels: width = cellMin (proportional, takes space from graph)
    var dayLabelsWidth = showDayLabels ? Math.max(12, cellMin * 1.2) : 0;

    // Week headers: height = 0.8 * cellHeight (proportional)
    var weekHeaderHeight = showLabels ? Math.max(8, rawCellHeight * 0.7) : 0;

    // Second pass: recalculate cells with labels space subtracted
    var finalGraphWidth = graphAreaWidth - dayLabelsWidth;
    var finalGraphHeight = graphAreaHeight - weekHeaderHeight;

    var cellWidth = (finalGraphWidth - (weeksCount - 1) * gap) / weeksCount;
    var cellHeight = (finalGraphHeight - (daysCount - 1) * gap) / daysCount;

    // Clamp to reasonable bounds
    cellWidth = Math.max(2, Math.min(80, cellWidth));
    cellHeight = Math.max(2, Math.min(80, cellHeight));

    // Round for crisp rendering
    cellWidth = Math.floor(cellWidth);
    cellHeight = Math.floor(cellHeight);
    gap = Math.max(1, Math.floor(gap));
    dayLabelsWidth = Math.floor(dayLabelsWidth);
    weekHeaderHeight = Math.floor(weekHeaderHeight);

    // All proportional sizes based on actual cell dimensions
    var minDim = Math.min(cellWidth, cellHeight);
    var cellRadius = Math.max(1, Math.round(minDim * 0.15));
    var labelFontSize = Math.max(6, Math.min(14, Math.round(minDim * 0.6)));

    // Apply all CSS variables
    var root = document.documentElement;
    root.style.setProperty('--cell-width', cellWidth + 'px');
    root.style.setProperty('--cell-height', cellHeight + 'px');
    root.style.setProperty('--cell-gap', gap + 'px');
    root.style.setProperty('--cell-radius', cellRadius + 'px');
    root.style.setProperty('--week-header-height', weekHeaderHeight + 'px');
    root.style.setProperty('--day-labels-width', dayLabelsWidth + 'px');
    root.style.setProperty('--label-font-size', labelFontSize + 'px');
    root.style.setProperty('--header-height', headerHeight + 'px');
    root.style.setProperty('--footer-height', footerHeight + 'px');
    root.style.setProperty('--padding', padding + 'px');

    // Store in state
    state.currentCellWidth = cellWidth;
    state.currentCellHeight = cellHeight;
    state.currentCellGap = gap;

    return { cellWidth: cellWidth, cellHeight: cellHeight, gap: gap };
  }

  // ==================== SDK Wait Helper ====================
  function waitForSDK(timeout) {
    timeout = timeout || 10000;
    return new Promise(function (resolve) {
      if (window.MyWallpaper) {
        resolve(window.MyWallpaper);
        return;
      }
      var start = Date.now();
      var interval = setInterval(function () {
        if (window.MyWallpaper) {
          clearInterval(interval);
          resolve(window.MyWallpaper);
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          resolve(null);
        }
      }, 50);
    });
  }

  // ==================== Initialization ====================
  async function init() {
    showLoading('Initializing...');
    api = await waitForSDK();
    if (!api) {
      showError('SDK Not Available', 'MyWallpaper SDK failed to load.');
      return;
    }

    // Initial layout calculation
    calculateAndApplyResponsiveLayout(document.body.clientWidth, document.body.clientHeight);

    // PRIMARY: Use ResizeObserver on body to detect container resizing
    // This works even when the host doesn't send viewport:resize events
    if (typeof ResizeObserver !== 'undefined') {
      var resizeObserver = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var width = entry.contentRect.width;
          var height = entry.contentRect.height;
          if (width > 0 && height > 0) {
            calculateAndApplyResponsiveLayout(width, height);
            // Re-render graph if contributions are loaded
            if (state.contributions) {
              renderGraph(state.contributions, api.config);
            }
          }
        }
      });
      resizeObserver.observe(document.body);
    }

    // BACKUP: Also listen to viewport:resize from host (if available)
    api.onEvent('viewport:resize', function (data) {
      if (data.width && data.height) {
        calculateAndApplyResponsiveLayout(data.width, data.height);
        if (state.contributions) {
          renderGraph(state.contributions, api.config);
        }
      }
    });

    setupEventListeners();
    ensureStoragePermission();

    if (await checkAuth()) await loadData();

    api.ready({
      capabilities: ['hot-reload', 'system-events', 'storage', 'network'],
      subscribedEvents: ['theme:change', 'visibility:change', 'viewport:resize']
    });
  }

  init();
})();

