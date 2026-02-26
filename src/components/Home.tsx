import type { CSSProperties, RefObject } from "react";
import { ShodoCanvas, type ShodoCanvasHandle } from "./ShodoCanvas";

import type { PageName } from "../hooks/usePageTransition";

interface HomeProps {
  onNavigate?: (page: PageName) => void;
  shodoRef?: RefObject<ShodoCanvasHandle | null>;
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
  },
  left: {
    flex: 1,
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
  right: {
    flex: 1,
    height: "100vh",
    position: "relative",
  },
};

export function Home({ onNavigate, shodoRef }: HomeProps) {
  return (
    <div style={styles.container}>
      <div style={styles.left}>
        <div style={styles.content}>
          <h1 style={styles.name} data-dissolve="text">Kamo Tomoki</h1>
          <nav style={styles.nav}>
            <a href="#contact" style={styles.navLink} data-dissolve="text">contact</a>
            <a
              href="/works"
              style={styles.navLink}
              data-dissolve="text"
              onClick={(e) => {
                e.preventDefault();
                onNavigate?.("works");
              }}
            >
              works
            </a>
          </nav>
        </div>
      </div>
      <div style={styles.right}>
        <ShodoCanvas ref={shodoRef} />
      </div>
    </div>
  );
}
