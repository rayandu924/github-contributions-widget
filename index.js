import { jsxs as s, jsx as o } from "react/jsx-runtime";
import { useSettings as fe, useViewport as ge, useOAuth as ye, useStorage as be } from "@mywallpaper/sdk-react";
import { useState as k, useRef as pe, useMemo as A, useCallback as I, useEffect as P } from "react";
const me = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ve = `query($username: String!, $from: DateTime!, $to: DateTime!) {
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
}`;
function xe(e, a) {
  if (e === 0 || a === 0) return 0;
  const i = e / a;
  return i <= 0.25 ? 1 : i <= 0.5 ? 2 : i <= 0.75 ? 3 : 4;
}
function we(e) {
  return e >= 1e3 ? (e / 1e3).toFixed(1) + "k" : e.toString();
}
function Me(e, a) {
  if (a !== "month") return e;
  const i = /* @__PURE__ */ new Date(), l = i.getFullYear(), h = i.getMonth();
  return e.filter(
    (b) => b.contributionDays.some((u) => {
      const c = new Date(u.date);
      return c.getFullYear() === l && c.getMonth() === h;
    })
  );
}
function Se(e, a, i, l) {
  const b = l.showHeader !== !1, u = l.showLabels !== !1, c = l.showDayLabels !== !1, W = l.showFooter !== !1, x = Math.min(8, e * 0.02, a * 0.02), z = b ? Math.min(40, a * 0.1) : 0, Y = W ? Math.min(24, a * 0.06) : 0;
  let p = Math.max(80, e - x * 2), w = Math.max(40, a - x * 2 - z - Y);
  const d = Math.min(p / i, w / 7);
  let g = Math.max(1, Math.round(d * 0.12));
  const F = (p - (i - 1) * g) / i, $ = (w - 6 * g) / 7, q = Math.min(F, $), H = c ? Math.max(12, Math.floor(q * 1.2)) : 0, M = u ? Math.max(8, Math.floor($ * 0.7)) : 0;
  p -= H, w -= M;
  let S = (p - (i - 1) * g) / i, C = (w - 6 * g) / 7;
  S = Math.floor(Math.max(2, Math.min(80, S))), C = Math.floor(Math.max(2, Math.min(80, C))), g = Math.max(1, Math.floor(g));
  const T = Math.min(S, C), m = Math.max(1, Math.round(T * 0.15)), R = Math.max(6, Math.min(14, Math.round(T * 0.6)));
  return {
    cellWidth: S,
    cellHeight: C,
    cellGap: g,
    cellRadius: m,
    labelFontSize: R,
    dayLabelsWidth: H,
    weekHeaderHeight: M,
    headerHeight: z,
    footerHeight: Y,
    padding: x
  };
}
function Ce({ count: e, date: a, x: i, y: l }) {
  const h = new Date(a).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  return /* @__PURE__ */ s(
    "div",
    {
      style: {
        position: "fixed",
        left: i + 10,
        top: l - 30,
        padding: "4px 8px",
        background: "#1c2128",
        border: "1px solid #30363d",
        borderRadius: 4,
        fontSize: 10,
        color: "#f0f6fc",
        pointerEvents: "none",
        zIndex: 1e3,
        whiteSpace: "nowrap"
      },
      children: [
        /* @__PURE__ */ s("span", { style: { fontWeight: 700 }, children: [
          e,
          " contribution",
          e !== 1 ? "s" : ""
        ] }),
        /* @__PURE__ */ s("span", { style: { color: "#8b949e", marginLeft: 3 }, children: [
          "on ",
          h
        ] })
      ]
    }
  );
}
function De({
  day: e,
  level: a,
  colorLevels: i,
  cellWidth: l,
  cellHeight: h,
  cellRadius: b,
  animDelay: u,
  onHover: c,
  onMove: W,
  onLeave: x
}) {
  return /* @__PURE__ */ o(
    "div",
    {
      style: {
        width: l,
        height: h,
        borderRadius: b,
        background: i[a],
        cursor: "pointer",
        flexShrink: 0,
        opacity: 0,
        animation: "fadeIn 0.3s ease forwards",
        animationDelay: `${u}ms`,
        transition: "opacity 0.1s"
      },
      onMouseEnter: (z) => c(e, z),
      onMouseMove: W,
      onMouseLeave: x
    }
  );
}
function ze() {
  const e = fe(), { width: a, height: i } = ge(), { request: l, isConnected: h } = ye(), b = be(), [u, c] = k("connecting"), [W, x] = k(""), [z, Y] = k(""), [p, w] = k(null), [d, g] = k(null), [F, $] = k((/* @__PURE__ */ new Date()).getFullYear()), [q, H] = k(null), M = pe(null), S = A(
    () => [
      e.colorLevel0 || "#161b22",
      e.colorLevel1 || "#0e4429",
      e.colorLevel2 || "#006d32",
      e.colorLevel3 || "#26a641",
      e.colorLevel4 || "#39d353"
    ],
    [
      e.colorLevel0,
      e.colorLevel1,
      e.colorLevel2,
      e.colorLevel3,
      e.colorLevel4
    ]
  ), C = I(async () => (await l("github", "/user", {
    headers: { Accept: "application/vnd.github.v3+json" }
  })).data, [l]), T = I(
    async (t, n) => {
      var j;
      const r = `${n}-01-01T00:00:00Z`, f = `${n}-12-31T23:59:59Z`, y = (await l("github", "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json"
        },
        body: {
          query: ve,
          variables: { username: t, from: r, to: f }
        }
      })).data;
      if ((j = y.errors) != null && j.length)
        throw new Error(y.errors[0].message || "GraphQL query failed");
      return y.data.user.contributionsCollection;
    },
    [l]
  ), m = I(async () => {
    try {
      c("loading");
      const t = F, n = await b.get("contributionData");
      if (n && n.year === t && Date.now() - n.timestamp < (e.refreshInterval || 30) * 60 * 1e3) {
        w(n.user), g(n.contributions), c("grid");
        return;
      }
      const r = await C(), f = await T(r.login, t);
      w(r), g(f), c("grid"), await b.set("contributionData", {
        user: r,
        contributions: f,
        year: t,
        timestamp: Date.now()
      });
    } catch (t) {
      const n = t instanceof Error ? t.message : "Unknown error";
      x("Failed to Load Data"), Y(n), c("error");
    }
  }, [F, e.refreshInterval, b, C, T]);
  P(() => {
    let t = !1;
    async function n() {
      c("connecting");
      const r = await h("github");
      if (!t) {
        if (!r) {
          c("connecting");
          return;
        }
        await m();
      }
    }
    return n(), () => {
      t = !0;
    };
  }, [h, m]), P(() => {
    if (u !== "grid") return;
    const t = (e.refreshInterval || 30) * 60 * 1e3;
    return M.current = setInterval(() => {
      m();
    }, t), () => {
      M.current && (clearInterval(M.current), M.current = null);
    };
  }, [u, e.refreshInterval, m]), P(() => {
    $((/* @__PURE__ */ new Date()).getFullYear());
  }, []);
  const R = e.displayMode || "year", G = (d == null ? void 0 : d.contributionCalendar.weeks) ?? [], v = A(() => Me(G, R), [G, R]), U = v.length || 53, N = A(
    () => Se(a, i, U, e),
    [a, i, U, e]
  ), O = A(() => {
    let t = 0;
    for (const n of v)
      for (const r of n.contributionDays)
        r.contributionCount > t && (t = r.contributionCount);
    return t;
  }, [v]), X = A(() => {
    if (!d || e.showLabels === !1) return /* @__PURE__ */ new Map();
    const t = d.contributionCalendar.months, n = /* @__PURE__ */ new Map();
    let r = 0, f = 0;
    if (R === "month" && v.length > 0) {
      const y = new Date(v[0].contributionDays[0].date).getMonth(), j = t.findIndex((he) => {
        const ue = new Date(2024, y, 1).toLocaleDateString("en", { month: "short" }).toLowerCase();
        return he.name.toLowerCase().startsWith(ue);
      });
      r = j === -1 ? 0 : j;
    }
    for (let L = 0; L < v.length; L++)
      if (t[r]) {
        const y = t[r];
        f === 0 && n.set(L, y.name.substring(0, 3)), f++, f >= y.totalWeeks && (r++, f = 0);
      }
    return n;
  }, [d, v, R, e.showLabels]), Z = I((t, n) => {
    H({ count: t.contributionCount, date: t.date, x: n.clientX, y: n.clientY });
  }, []), V = I((t) => {
    H((n) => n ? { ...n, x: t.clientX, y: t.clientY } : null);
  }, []), J = I(() => {
    H(null);
  }, []), K = I(async () => {
    await h("github") && await m();
  }, [h, m]), ee = "@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }";
  if (u === "connecting")
    return /* @__PURE__ */ s(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          textAlign: "center",
          padding: 16,
          boxSizing: "border-box"
        },
        children: [
          /* @__PURE__ */ o("div", { style: { fontSize: 32 }, children: "🔐" }),
          /* @__PURE__ */ o("div", { style: { fontSize: 14, fontWeight: 600, color: "#f0f6fc" }, children: "GitHub Access Required" }),
          /* @__PURE__ */ o("div", { style: { fontSize: 11, color: "#8b949e" }, children: "Reinstall and grant access" })
        ]
      }
    );
  if (u === "loading")
    return /* @__PURE__ */ s(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          textAlign: "center",
          padding: 16,
          boxSizing: "border-box"
        },
        children: [
          /* @__PURE__ */ o(
            "div",
            {
              style: {
                width: 30,
                height: 30,
                border: "2px solid #30363d",
                borderTopColor: "#238636",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }
            }
          ),
          /* @__PURE__ */ o("style", { children: "@keyframes spin { to { transform: rotate(360deg); } }" }),
          /* @__PURE__ */ o("div", { style: { fontSize: 14, fontWeight: 600, color: "#f0f6fc" }, children: "Loading..." }),
          /* @__PURE__ */ o("div", { style: { fontSize: 11, color: "#8b949e" }, children: "Fetching your GitHub data..." })
        ]
      }
    );
  if (u === "error")
    return /* @__PURE__ */ s(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          textAlign: "center",
          padding: 16,
          boxSizing: "border-box"
        },
        children: [
          /* @__PURE__ */ o("div", { style: { fontSize: 32, color: "#f85149" }, children: "⚠️" }),
          /* @__PURE__ */ o("div", { style: { fontSize: 14, fontWeight: 600, color: "#f0f6fc" }, children: W }),
          /* @__PURE__ */ o("div", { style: { fontSize: 11, color: "#8b949e" }, children: z }),
          /* @__PURE__ */ o(
            "button",
            {
              onClick: K,
              style: {
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                border: "1px solid #30363d",
                background: "#21262d",
                color: "#c9d1d9"
              },
              children: "Retry"
            }
          )
        ]
      }
    );
  const {
    cellWidth: te,
    cellHeight: B,
    cellGap: E,
    cellRadius: ne,
    labelFontSize: D,
    dayLabelsWidth: oe,
    weekHeaderHeight: Q,
    headerHeight: ie,
    footerHeight: re,
    padding: ae
  } = N, le = e.showHeader !== !1, _ = e.showFooter !== !1, se = e.showDayLabels !== !1, ce = e.showStats !== !1, de = e.showBackground ? {
    background: e.backgroundColor || "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
    backdropFilter: `blur(${e.backgroundBlur ?? 10}px)`,
    WebkitBackdropFilter: `blur(${e.backgroundBlur ?? 10}px)`
  } : { background: "transparent" };
  return /* @__PURE__ */ s(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: ae,
        boxSizing: "border-box",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#c9d1d9",
        position: "relative",
        overflow: "hidden"
      },
      children: [
        /* @__PURE__ */ o("style", { children: ee }),
        /* @__PURE__ */ o(
          "div",
          {
            style: {
              position: "absolute",
              inset: 0,
              zIndex: -1,
              pointerEvents: "none",
              ...de
            }
          }
        ),
        le && p && /* @__PURE__ */ s(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              height: ie,
              flexShrink: 0
            },
            children: [
              /* @__PURE__ */ s("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                /* @__PURE__ */ o(
                  "img",
                  {
                    src: p.avatar_url,
                    alt: "",
                    style: { width: 20, height: 20, borderRadius: "50%", flexShrink: 0 }
                  }
                ),
                /* @__PURE__ */ s("div", { children: [
                  /* @__PURE__ */ o("div", { style: { fontWeight: 600, fontSize: D, color: "#c9d1d9" }, children: p.login }),
                  /* @__PURE__ */ o("div", { style: { fontSize: D * 0.8, color: "#8b949e" }, children: F })
                ] })
              ] }),
              _ && ce && d && /* @__PURE__ */ o("div", { style: { display: "flex", gap: 8 }, children: [
                { value: d.totalCommitContributions, label: "commits" },
                { value: d.totalPullRequestContributions, label: "PRs" },
                { value: d.totalIssueContributions, label: "issues" },
                { value: d.contributionCalendar.totalContributions, label: "total" }
              ].map((t) => /* @__PURE__ */ s("div", { style: { display: "flex", alignItems: "baseline", gap: 2 }, children: [
                /* @__PURE__ */ o("span", { style: { fontSize: D, fontWeight: 600, color: "#f0f6fc" }, children: we(t.value) }),
                /* @__PURE__ */ o("span", { style: { fontSize: D * 0.7, color: "#8b949e" }, children: t.label })
              ] }, t.label)) })
            ]
          }
        ),
        /* @__PURE__ */ o("div", { style: { flex: 1, display: "flex", minHeight: 0, minWidth: 0 }, children: /* @__PURE__ */ s("div", { style: { display: "flex", width: "100%", height: "100%" }, children: [
          se && /* @__PURE__ */ o(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: E,
                width: oe,
                flexShrink: 0,
                paddingTop: Q
              },
              children: me.map((t, n) => /* @__PURE__ */ o(
                "div",
                {
                  style: {
                    height: B,
                    fontSize: D,
                    color: "#8b949e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 3,
                    visibility: n % 2 === 1 ? "hidden" : "visible"
                  },
                  children: t
                },
                t
              ))
            }
          ),
          /* @__PURE__ */ o("div", { style: { display: "flex", gap: E, flex: 1 }, children: v.map((t, n) => /* @__PURE__ */ s(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: E,
                flex: 1
              },
              children: [
                /* @__PURE__ */ o(
                  "div",
                  {
                    style: {
                      height: Q,
                      fontSize: D,
                      color: "#8b949e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    },
                    children: X.get(n) || ""
                  }
                ),
                t.contributionDays.map((r, f) => {
                  const L = xe(r.contributionCount, O), y = (n * 7 + f) * 3;
                  return /* @__PURE__ */ o(
                    De,
                    {
                      day: r,
                      level: L,
                      colorLevels: S,
                      cellWidth: te,
                      cellHeight: B,
                      cellRadius: ne,
                      animDelay: y,
                      onHover: Z,
                      onMove: V,
                      onLeave: J
                    },
                    r.date
                  );
                })
              ]
            },
            n
          )) })
        ] }) }),
        _ && /* @__PURE__ */ s(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              height: re,
              flexShrink: 0,
              fontSize: D,
              color: "#8b949e"
            },
            children: [
              /* @__PURE__ */ o("span", { children: "Less" }),
              /* @__PURE__ */ o("div", { style: { display: "flex", gap: 2 }, children: S.map((t, n) => /* @__PURE__ */ o(
                "div",
                {
                  style: {
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: t
                  }
                },
                n
              )) }),
              /* @__PURE__ */ o("span", { children: "More" })
            ]
          }
        ),
        q && /* @__PURE__ */ o(Ce, { ...q })
      ]
    }
  );
}
export {
  ze as default
};
