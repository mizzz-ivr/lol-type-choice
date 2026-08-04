import {
  SOCIAL_PREVIEW_COLORS,
  SOCIAL_PREVIEW_COPY
} from "@/config/socialPreview";

export function SocialPreviewImage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        backgroundColor: SOCIAL_PREVIEW_COLORS.base,
        color: SOCIAL_PREVIEW_COLORS.text,
        padding: "64px 72px"
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-180px",
          right: "-80px",
          width: "520px",
          height: "520px",
          display: "flex",
          borderRadius: "9999px",
          backgroundColor: "rgba(34, 211, 238, 0.16)"
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "126px",
          bottom: "-210px",
          width: "430px",
          height: "430px",
          display: "flex",
          borderRadius: "9999px",
          border: `2px solid ${SOCIAL_PREVIEW_COLORS.accent}`,
          opacity: 0.22
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "84px",
          right: "78px",
          width: "260px",
          height: "260px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          borderRadius: "48px",
          border: `1px solid ${SOCIAL_PREVIEW_COLORS.border}`,
          backgroundColor: SOCIAL_PREVIEW_COLORS.card,
          transform: "rotate(6deg)"
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 86,
            lineHeight: 1,
            fontWeight: 800,
            color: SOCIAL_PREVIEW_COLORS.accent
          }}
        >
          8
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 22,
            letterSpacing: "0.22em",
            color: SOCIAL_PREVIEW_COLORS.muted
          }}
        >
          AXES
        </div>
      </div>

      <div
        style={{
          width: "790px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: SOCIAL_PREVIEW_COLORS.accentSoft
            }}
          >
            <span
              style={{
                width: 42,
                height: 4,
                display: "flex",
                marginRight: 16,
                borderRadius: 9999,
                backgroundColor: SOCIAL_PREVIEW_COLORS.accent
              }}
            />
            {SOCIAL_PREVIEW_COPY.eyebrow}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 36,
              fontSize: 58,
              lineHeight: 1.18,
              fontWeight: 800,
              letterSpacing: "-0.035em"
            }}
          >
            {SOCIAL_PREVIEW_COPY.title.split("\n").map((line) => (
              <div key={line} style={{ display: "flex" }}>
                {line}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 25,
              lineHeight: 1.45,
              color: SOCIAL_PREVIEW_COLORS.muted
            }}
          >
            {SOCIAL_PREVIEW_COPY.description}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {SOCIAL_PREVIEW_COPY.badges.map((badge) => (
              <div
                key={badge}
                style={{
                  display: "flex",
                  padding: "10px 16px",
                  borderRadius: 9999,
                  border: `1px solid ${SOCIAL_PREVIEW_COLORS.border}`,
                  backgroundColor: SOCIAL_PREVIEW_COLORS.card,
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "0.08em"
                }}
              >
                {badge}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: 16,
              letterSpacing: "0.12em",
              color: SOCIAL_PREVIEW_COLORS.muted
            }}
          >
            {SOCIAL_PREVIEW_COPY.disclaimer}
          </div>
        </div>
      </div>
    </div>
  );
}
