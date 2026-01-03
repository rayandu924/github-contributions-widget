/**
 * GitHub Contributions Widget
 * Uses MyWallpaper SDK for OAuth, network proxy, and storage
 *
 * Security: Uses safe DOM methods (createElement, textContent) instead of innerHTML
 */
(function() {
  'use strict';

  // ==================== State Management ====================
  var state = {
    user: null,
    contributions: null,
    year: new Date().getFullYear(),
    refreshTimer: null,
    isConnected: false,
    hasRequiredScopes: false
  };

  // ==================== DOM Elements ====================
  var elements = {
    stateAuth: document.getElementById('state-auth'),
    stateScope: document.getElementById('state-scope'),
    stateLoading: document.getElementById('state-loading'),
    stateError: document.getElementById('state-error'),
    container: document.getElementById('container'),
    background: document.getElementById('background'),
    btnConnect: document.getElementById('btn-connect'),
    btnScope: document.getElementById('btn-scope'),
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
    legend: document.getElementById('legend'),
    legendSquares: document.getElementById('legend-squares'),
    tooltip: document.getElementById('tooltip'),
    tooltipCount: document.getElementById('tooltip-count'),
    tooltipDate: document.getElementById('tooltip-date')
  };

  // ==================== SDK API Reference ====================
  var api = null;

  function waitForSDK() {
    return new Promise(function(resolve) {
      if (window.MyWallpaper) {
        resolve(window.MyWallpaper);
        return;
      }
      var checkInterval = setInterval(function() {
        if (window.MyWallpaper) {
          clearInterval(checkInterval);
          resolve(window.MyWallpaper);
        }
      }, 50);
      setTimeout(function() {
        clearInterval(checkInterval);
        resolve(null);
      }, 10000);
    });
  }

  // ==================== UI State Helpers ====================
  function showState(stateName) {
    ['stateAuth', 'stateScope', 'stateLoading', 'stateError', 'container'].forEach(function(s) {
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

  // ==================== Theme & Styling ====================
  function applyTheme(config) {
    var theme = config.theme || 'github-green';
    var container = document.body;

    // Remove old theme classes
    container.className = container.className.replace(/theme-\S+/g, '');

    if (theme === 'custom') {
      var baseColor = config.customColor || '#39d353';
      applyCustomTheme(baseColor);
    } else {
      container.classList.add('theme-' + theme);
    }

    // Apply CSS variables
    document.documentElement.style.setProperty('--cell-size', (config.cellSize || 12) + 'px');
    document.documentElement.style.setProperty('--cell-gap', (config.cellGap || 3) + 'px');
    document.documentElement.style.setProperty('--cell-radius', (config.borderRadius || 2) + 'px');

    // Background
    if (config.showBackground) {
      var opacity = (config.backgroundOpacity || 80) / 100;
      var blur = config.backgroundBlur || 10;
      var bgColor = config.backgroundColor || '#0d1117';
      elements.background.style.background = hexToRgba(bgColor, opacity);
      elements.background.style.backdropFilter = 'blur(' + blur + 'px)';
      elements.background.style.webkitBackdropFilter = 'blur(' + blur + 'px)';
    } else {
      elements.background.style.background = 'transparent';
      elements.background.style.backdropFilter = 'none';
    }

    // Show/hide elements
    elements.dayLabels.style.display = config.showDayLabels !== false ? 'flex' : 'none';
    elements.stats.style.display = config.showStats !== false ? 'flex' : 'none';
    elements.legend.style.display = config.showLabels !== false ? 'flex' : 'none';

    // Render legend squares
    renderLegendSquares();
  }

  function applyCustomTheme(baseColor) {
    var rgb = hexToRgb(baseColor);
    if (!rgb) return;

    var levels = [
      '#161b22',
      adjustBrightness(rgb, -60),
      adjustBrightness(rgb, -30),
      baseColor,
      adjustBrightness(rgb, 20)
    ];

    for (var i = 0; i < levels.length; i++) {
      document.documentElement.style.setProperty('--level-' + i, levels[i]);
    }
  }

  function hexToRgb(hex) {
    var result = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  function hexToRgba(hex, alpha) {
    var rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
  }

  function adjustBrightness(rgb, percent) {
    var adjust = function(value) {
      return Math.max(0, Math.min(255, Math.round(value + (255 * percent / 100))));
    };
    var r = adjust(rgb.r);
    var g = adjust(rgb.g);
    var b = adjust(rgb.b);
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  // ==================== GitHub API ====================
  async function fetchUserProfile() {
    var response = await api.network.fetch('https://api.github.com/user', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!response.ok) {
      throw new Error('GitHub API error: ' + response.status);
    }
    return await response.json();
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

    var response = await api.network.fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        query: query,
        variables: { username: username, from: fromDate, to: toDate }
      })
    });

    if (!response.ok) {
      throw new Error('GitHub API error: ' + response.status);
    }

    var data = await response.json();
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
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(function(day) {
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

    statsData.forEach(function(stat) {
      var statDiv = createElement('div', 'stat');
      var valueSpan = createElement('span', 'stat-value', formatNumber(stat.value));
      var labelSpan = createElement('span', 'stat-label', stat.label);
      statDiv.appendChild(valueSpan);
      statDiv.appendChild(labelSpan);
      elements.stats.appendChild(statDiv);
    });
  }

  function formatNumber(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  function renderGraph(contributions, config) {
    clearElement(elements.graph);

    var calendar = contributions.contributionCalendar;
    var weeks = calendar.weeks;
    var months = calendar.months;

    // Calculate max contributions
    var maxContributions = 0;
    weeks.forEach(function(week) {
      week.contributionDays.forEach(function(day) {
        if (day.contributionCount > maxContributions) {
          maxContributions = day.contributionCount;
        }
      });
    });

    var currentMonthIndex = 0;
    var weekInMonth = 0;

    weeks.forEach(function(week, weekIndex) {
      var weekDiv = createElement('div', 'week');

      // Month header
      var monthLabel = '';
      if (config.showLabels !== false && months[currentMonthIndex]) {
        var month = months[currentMonthIndex];
        if (weekInMonth === 0) {
          monthLabel = month.name.substring(0, 3);
        }
        weekInMonth++;
        if (weekInMonth >= month.totalWeeks) {
          currentMonthIndex++;
          weekInMonth = 0;
        }
      }

      var header = createElement('div', 'week-header', monthLabel);
      weekDiv.appendChild(header);

      week.contributionDays.forEach(function(day, dayIndex) {
        var level = getContributionLevel(day.contributionCount, maxContributions);
        var delay = (weekIndex * 7 + dayIndex) * 2;

        var dayDiv = createElement('div', 'day level-' + level);
        dayDiv.dataset.date = day.date;
        dayDiv.dataset.count = day.contributionCount;
        dayDiv.style.animationDelay = delay + 'ms';

        if (config.showTooltips !== false) {
          setupDayTooltip(dayDiv);
        }

        weekDiv.appendChild(dayDiv);
      });

      elements.graph.appendChild(weekDiv);
    });
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
    dayDiv.addEventListener('mouseenter', function(e) {
      var count = parseInt(dayDiv.dataset.count, 10);
      var date = new Date(dayDiv.dataset.date);
      var formattedDate = date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });

      elements.tooltipCount.textContent = count + ' contribution' + (count !== 1 ? 's' : '');
      elements.tooltipDate.textContent = 'on ' + formattedDate;
      elements.tooltip.classList.add('visible');
      updateTooltipPosition(e);
    });

    dayDiv.addEventListener('mousemove', updateTooltipPosition);

    dayDiv.addEventListener('mouseleave', function() {
      elements.tooltip.classList.remove('visible');
    });
  }

  function updateTooltipPosition(e) {
    elements.tooltip.style.left = (e.clientX + 10) + 'px';
    elements.tooltip.style.top = (e.clientY - 30) + 'px';
  }

  // ==================== Data Management ====================
  async function loadCachedData() {
    try {
      var cached = await api.storage.get('contributionData');
      if (cached && cached.timestamp) {
        var age = Date.now() - cached.timestamp;
        var maxAge = (api.config.refreshInterval || 30) * 60 * 1000;
        if (age < maxAge) {
          return cached;
        }
      }
    } catch (error) {
      console.warn('Failed to load cached data:', error);
    }
    return null;
  }

  async function cacheData(user, contributions, year) {
    try {
      await api.storage.set('contributionData', {
        user: user,
        contributions: contributions,
        year: year,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn('Failed to cache data:', error);
    }
  }

  // ==================== Main Flow ====================
  async function checkAuth() {
    try {
      state.isConnected = await api.oauth.isConnected('github');
      if (!state.isConnected) {
        showState('stateAuth');
        return false;
      }

      var scopes = await api.oauth.getScopes('github');
      state.hasRequiredScopes = scopes.includes('read:user');

      if (!state.hasRequiredScopes) {
        showState('stateScope');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      showError('Authentication Error', 'Failed to check GitHub authentication status.');
      return false;
    }
  }

  async function connectGitHub() {
    try {
      showLoading('Connecting to GitHub...');
      var result = await api.oauth.request('github');
      if (result.success) {
        state.isConnected = true;
        await loadData();
      } else {
        showState('stateAuth');
      }
    } catch (error) {
      console.error('GitHub connection failed:', error);
      showError('Connection Failed', 'Unable to connect to GitHub. Please try again.');
    }
  }

  async function requestScopes() {
    try {
      showLoading('Requesting permissions...');
      var granted = await api.oauth.requestScopes('github', ['read:user']);
      if (granted) {
        state.hasRequiredScopes = true;
        await loadData();
      } else {
        showState('stateScope');
      }
    } catch (error) {
      console.error('Scope request failed:', error);
      showError('Permission Error', 'Unable to request additional permissions.');
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

      showLoading('Fetching profile...');
      state.user = await fetchUserProfile();

      showLoading('Fetching contributions...');
      state.contributions = await fetchContributions(state.user.login, state.year);

      await cacheData(state.user, state.contributions, state.year);
      renderUI();
    } catch (error) {
      console.error('Failed to load data:', error);
      showError('Failed to Load Data', error.message || 'Unable to fetch your GitHub contributions.');
    }
  }

  function renderUI() {
    var config = api.config;
    applyTheme(config);

    elements.avatar.src = state.user.avatar_url;
    elements.username.textContent = state.user.login;
    elements.yearLabel.textContent = state.year;

    renderDayLabels();
    renderStats(state.contributions);
    renderGraph(state.contributions, config);

    showState('container');
    setupRefreshTimer();
  }

  function setupRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
    }
    var interval = (api.config.refreshInterval || 30) * 60 * 1000;
    state.refreshTimer = setInterval(async function() {
      if (state.isConnected && state.hasRequiredScopes) {
        await loadData();
      }
    }, interval);
  }

  // ==================== Event Handlers ====================
  function setupEventListeners() {
    elements.btnConnect.addEventListener('click', connectGitHub);
    elements.btnScope.addEventListener('click', requestScopes);
    elements.btnRetry.addEventListener('click', async function() {
      if (await checkAuth()) {
        await loadData();
      }
    });

    api.on('theme:change', function() {
      if (state.contributions) {
        applyTheme(api.config);
      }
    });

    api.on('visibility:change', function(data) {
      if (data.hidden) {
        if (state.refreshTimer) {
          clearInterval(state.refreshTimer);
          state.refreshTimer = null;
        }
      } else {
        if (state.isConnected && state.contributions) {
          setupRefreshTimer();
        }
      }
    });

    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'SETTINGS_UPDATE') {
        if (state.contributions) {
          var oldYear = state.year;
          var newYearSetting = api.config.year || 'current';
          var newYear = newYearSetting === 'current' ? new Date().getFullYear() : parseInt(newYearSetting, 10);

          if (newYear !== oldYear) {
            loadData();
          } else {
            applyTheme(api.config);
            renderGraph(state.contributions, api.config);
          }
        }
      }
    });
  }

  // ==================== Initialization ====================
  async function init() {
    showLoading('Initializing...');

    api = await waitForSDK();

    if (!api) {
      showError('SDK Not Available', 'MyWallpaper SDK failed to load. Please try refreshing.');
      return;
    }

    console.log('[GitHub Contributions] SDK loaded, version:', api.version);
    console.log('[GitHub Contributions] Config:', api.config);

    setupEventListeners();

    if (await checkAuth()) {
      await loadData();
    }
  }

  init();
})();
