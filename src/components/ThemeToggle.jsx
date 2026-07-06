import { useTheme } from "../lib/ThemeContext.jsx";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={`Mudar para modo ${theme === "dark" ? "claro" : "escuro"}`}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        color: "var(--text-main)",
        fontSize: "20px",
        transition: "transform 0.2s ease, background 0.2s ease"
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-glass-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
