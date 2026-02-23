import type { CSSProperties } from "react";

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    padding: "0 62px",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: "48px",
    color: "#000000",
  },
  name: {
    fontSize: "96px",
    fontWeight: 700,
    fontFamily: "'Inter', sans-serif",
    lineHeight: "normal",
    margin: 0,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    fontSize: "30px",
  },
  navLink: {
    color: "#000000",
    textDecoration: "none",
    lineHeight: "normal",
  },
};

export function Home() {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.name}>Kamo Tomoki</h1>
        <nav style={styles.nav}>
          <a href="#contact" style={styles.navLink}>contact</a>
          <a href="#works" style={styles.navLink}>works</a>
        </nav>
      </div>
    </div>
  );
}
