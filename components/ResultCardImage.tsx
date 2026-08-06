import { RESULT_CARD_COLORS } from "@/config/resultCard";
import type { ResultCardData } from "@/lib/resultCard";

export function ResultCardImage({ data }: { data: ResultCardData }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        backgroundColor: RESULT_CARD_COLORS.base,
        color: RESULT_CARD_COLORS.text,
        padding: "58px 68px"
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-220px",
          right: "-120px",
          width: "600px",
          height: "600px",
          display: "flex",
          borderRadius: "9999px",
          backgroundColor: "rgba(34, 211, 238, 0.15)"
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "-150px",
          bottom: "-280px",
          width: "520px",
          height: "520px",
          display: "flex",
          borderRadius: "9999px",
          border: `2px solid ${RESULT_CARD_COLORS.accent}`,
          opacity: 0.18
        }}
      />

      <div
        style={{
          width: "100%",
          display: "flex",
          position: "relative",
          justifyContent: "space-between",
          gap: 42
        }}
      >
        <div
          style={{
            width: 720,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.16em",
                color: RESULT_CARD_COLORS.accentSoft
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 4,
                  display: "flex",
                  marginRight: 14,
                  borderRadius: 9999,
                  backgroundColor: RESULT_CARD_COLORS.accent
                }}
              />
              LoL PLAYSTYLE TYPE FINDER β
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 34,
                fontSize: 28,
                fontWeight: 700,
                color: RESULT_CARD_COLORS.muted
              }}
            >
              MY PLAYSTYLE TYPE
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 8,
                fontSize: 64,
                lineHeight: 1.12,
                fontWeight: 800,
                letterSpacing: "-0.035em"
              }}
            >
              {data.typeName}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 20,
                maxWidth: 690,
                fontSize: 25,
                lineHeight: 1.45,
                color: RESULT_CARD_COLORS.accentSoft
              }}
            >
              {data.oneLiner}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 17,
                  fontWeight: 700,
                  color: RESULT_CARD_COLORS.muted,
                  letterSpacing: "0.08em"
                }}
              >
                RECOMMENDED ROLES
              </div>
              {data.recommendedRoles.map((role) => (
                <div
                  key={role}
                  style={{
                    display: "flex",
                    padding: "9px 16px",
                    borderRadius: 9999,
                    border: `1px solid ${RESULT_CARD_COLORS.border}`,
                    backgroundColor: RESULT_CARD_COLORS.card,
                    fontSize: 18,
                    fontWeight: 800,
                    color: RESULT_CARD_COLORS.text
                  }}
                >
                  {role}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 17,
                fontSize: 15,
                letterSpacing: "0.11em",
                color: RESULT_CARD_COLORS.muted
              }}
            >
              UNOFFICIAL FAN DIAGNOSIS · 48 QUESTIONS · 8 AXES
            </div>
          </div>
        </div>

        <div
          style={{
            width: 320,
            display: "flex",
            flexDirection: "column",
            borderRadius: 34,
            border: `1px solid ${RESULT_CARD_COLORS.border}`,
            backgroundColor: RESULT_CARD_COLORS.card,
            padding: "34px 30px"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline"
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: "0.08em"
              }}
            >
              TOP 3 AXES
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 15,
                color: RESULT_CARD_COLORS.muted
              }}
            >
              / 100
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 30,
              marginTop: 42
            }}
          >
            {data.topAxes.map((entry, index) => (
              <div key={entry.axis} style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 27,
                        height: 27,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 9999,
                        backgroundColor: "rgba(34, 211, 238, 0.15)",
                        color: RESULT_CARD_COLORS.accentSoft,
                        fontSize: 14,
                        fontWeight: 800
                      }}
                    >
                      {index + 1}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        fontSize: 19,
                        fontWeight: 700
                      }}
                    >
                      {entry.label}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: 28,
                      fontWeight: 800,
                      color: RESULT_CARD_COLORS.accentSoft
                    }}
                  >
                    {entry.score}
                  </div>
                </div>
                <div
                  style={{
                    height: 9,
                    display: "flex",
                    marginTop: 13,
                    overflow: "hidden",
                    borderRadius: 9999,
                    backgroundColor: "#1f2937"
                  }}
                >
                  <div
                    style={{
                      width: `${entry.score}%`,
                      height: "100%",
                      display: "flex",
                      borderRadius: 9999,
                      backgroundColor: RESULT_CARD_COLORS.accent
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: "auto",
              paddingTop: 26,
              borderTop: `1px solid ${RESULT_CARD_COLORS.border}`
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 64,
                fontWeight: 800,
                lineHeight: 1,
                color: RESULT_CARD_COLORS.accent
              }}
            >
              8
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 9,
                fontSize: 15,
                letterSpacing: "0.2em",
                color: RESULT_CARD_COLORS.muted
              }}
            >
              AXIS PROFILE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
