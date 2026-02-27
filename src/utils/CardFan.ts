import { Scene, PerspectiveCamera } from "three";
import {
  CSS3DRenderer,
  CSS3DObject,
} from "three/examples/jsm/renderers/CSS3DRenderer.js";

// ── Data types ──────────────────────────────────────────

export interface CardData {
  title: string;
  description: string;
  tech: string[];
  year: string;
}

// ── Layout constants (base values at 1200px width) ──────

const CARD_WIDTH = 280;
const CARD_HEIGHT = 380;
const FAN_RADIUS = 800;
const FAN_ARC_DEGREES = 40;
const CARD_TILT_X_DEG = -5;
const CAMERA_Z = 920;
const CAMERA_Y = -100;

const SELECTED_LIFT_Y = 80;
const SELECTED_LIFT_Z = 300;
const HOVER_LIFT_Y = 40;
const HOVER_LIFT_Z = 50;

const LERP_FACTOR = 0.08;
const EPSILON = 0.1;
const EPSILON_ROT = 0.001;
const EPSILON_SCALE = 0.005;

// Scale reference width
const REF_WIDTH = 1200;
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.0;

// Selected card scale: on PC shows slightly larger, on SP restores to ~original
const SELECTED_SCALE_PC = 1.2;

// ── Internal card state ─────────────────────────────────

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface CardState {
  css3dObject: CSS3DObject;
  element: HTMLDivElement;
  index: number;
  targetPosition: Vec3;
  targetRotation: Vec3;
  currentPosition: Vec3;
  currentRotation: Vec3;
  targetScale: number;
  currentScale: number;
  targetOpacity: number;
  currentOpacity: number;
}

// ── CardFan class ───────────────────────────────────────

export class CardFan {
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer: CSS3DRenderer;
  private container: HTMLElement;
  private cards: CardState[] = [];
  private cardData: CardData[];
  private selectedIndex = -1;
  private hoveredIndex = -1;
  private animationFrame: number | null = null;
  private running = false;
  private width: number;
  private height: number;
  private needsRender = true;

  onCardClick?: (index: number, data: CardData) => void;
  onCardHover?: (index: number | null) => void;

  constructor(container: HTMLElement, cardData: CardData[]) {
    this.container = container;
    this.cardData = cardData;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    const scale = this.getScale();

    // Scene
    this.scene = new Scene();

    // Camera – scaled by viewport
    this.camera = new PerspectiveCamera(
      45,
      this.width / this.height,
      1,
      10000
    );
    this.camera.position.set(0, CAMERA_Y * scale, CAMERA_Z * scale);
    this.camera.lookAt(0, 0, 0);

    // CSS3DRenderer
    this.renderer = new CSS3DRenderer();
    this.renderer.setSize(this.width, this.height);
    Object.assign(this.renderer.domElement.style, {
      position: "absolute",
      top: "0",
      left: "0",
    });
    Object.assign(container.style, {
      position: "relative",
      overflow: "hidden",
    });
    container.appendChild(this.renderer.domElement);

    // Create card objects
    for (let i = 0; i < cardData.length; i++) {
      const element = this.createCardElement(cardData[i], i);
      const css3dObject = new CSS3DObject(element);
      // CSS3DObject sets userSelect:'none' by default – restore it
      element.style.userSelect = "auto";
      this.scene.add(css3dObject);

      this.cards.push({
        css3dObject,
        element,
        index: i,
        targetPosition: { x: 0, y: 0, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        currentPosition: { x: 0, y: -800, z: -200 },
        currentRotation: { x: 0, y: 0, z: 0 },
        targetScale: scale,
        currentScale: scale,
        targetOpacity: 1,
        currentOpacity: 1,
      });
    }

    // Compute layout targets
    this.computeFanLayout();

    // Set initial positions for entry animation (below viewport)
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      card.currentPosition = {
        x: card.targetPosition.x,
        y: card.targetPosition.y - 600 - i * 80,
        z: card.targetPosition.z - 300,
      };
      card.currentRotation = {
        x: card.targetRotation.x,
        y: card.targetRotation.y,
        z: 0,
      };
    }

    // Start animation loop
    this.running = true;
    this.needsRender = true;
    this.animate();
  }

  // ── Scale computation ─────────────────────────────────

  private getScale(): number {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.width / REF_WIDTH));
  }

  // ── Public API ──────────────────────────────────────

  selectCard(index: number): void {
    if (index === this.selectedIndex) {
      this.deselectCard();
      return;
    }
    this.selectedIndex = index;
    this.updateTargets();
    this.needsRender = true;

    // Update card visual states
    for (const card of this.cards) {
      if (card.index === index) {
        card.element.style.borderColor = "#000000";
        card.element.style.boxShadow = "0 8px 32px rgba(0,0,0,0.12)";
      } else {
        card.element.style.borderColor = "#e0e0e0";
        card.element.style.boxShadow = "none";
      }
    }
  }

  deselectCard(): void {
    this.selectedIndex = -1;
    this.updateTargets();
    this.needsRender = true;

    for (const card of this.cards) {
      card.element.style.borderColor =
        card.index === this.hoveredIndex ? "#000000" : "#e0e0e0";
      card.element.style.boxShadow =
        card.index === this.hoveredIndex
          ? "0 4px 20px rgba(0,0,0,0.08)"
          : "none";
    }
  }

  resize(): void {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    const scale = this.getScale();

    this.camera.aspect = this.width / this.height;
    this.camera.position.set(0, CAMERA_Y * scale, CAMERA_Z * scale);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);

    this.computeFanLayout();
    this.updateTargets();
    this.needsRender = true;
  }

  dispose(): void {
    this.running = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    for (const card of this.cards) {
      this.scene.remove(card.css3dObject);
    }
    this.cards = [];
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(
        this.renderer.domElement
      );
    }
  }

  // ── Private: Card DOM creation ──────────────────────

  private createCardElement(data: CardData, index: number): HTMLDivElement {
    const card = document.createElement("div");
    Object.assign(card.style, {
      width: `${CARD_WIDTH}px`,
      height: `${CARD_HEIGHT}px`,
      padding: "32px",
      background: "#ffffff",
      border: "1px solid #e0e0e0",
      boxSizing: "border-box",
      fontFamily: "'Inter', sans-serif",
      color: "#000000",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      cursor: "pointer",
      transition: "box-shadow 0.3s ease, border-color 0.3s ease",
      overflow: "hidden",
      backfaceVisibility: "hidden",
    });

    // Year
    const year = document.createElement("span");
    year.textContent = data.year;
    Object.assign(year.style, {
      fontSize: "14px",
      fontWeight: "400",
      color: "#888888",
    });
    card.appendChild(year);

    // Title
    const title = document.createElement("h3");
    title.textContent = data.title;
    Object.assign(title.style, {
      fontSize: "22px",
      fontWeight: "700",
      margin: "0",
      lineHeight: "1.3",
    });
    card.appendChild(title);

    // Description
    const desc = document.createElement("p");
    desc.textContent = data.description;
    Object.assign(desc.style, {
      fontSize: "14px",
      fontWeight: "400",
      color: "#444444",
      margin: "0",
      lineHeight: "1.6",
      flex: "1",
    });
    card.appendChild(desc);

    // Tech tags
    const techRow = document.createElement("div");
    Object.assign(techRow.style, {
      display: "flex",
      gap: "6px",
      flexWrap: "wrap",
      marginTop: "auto",
    });
    for (const t of data.tech) {
      const tag = document.createElement("span");
      tag.textContent = t;
      Object.assign(tag.style, {
        fontSize: "11px",
        fontWeight: "500",
        color: "#666666",
        border: "1px solid #cccccc",
        padding: "3px 8px",
        borderRadius: "2px",
      });
      techRow.appendChild(tag);
    }
    card.appendChild(techRow);

    // Hover events
    card.addEventListener("mouseenter", () => {
      this.hoveredIndex = index;
      this.updateTargets();
      this.needsRender = true;
      if (this.selectedIndex !== index) {
        card.style.borderColor = "#000000";
        card.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
      }
      this.onCardHover?.(index);
    });

    card.addEventListener("mouseleave", () => {
      if (this.hoveredIndex === index) this.hoveredIndex = -1;
      this.updateTargets();
      this.needsRender = true;
      if (this.selectedIndex !== index) {
        card.style.borderColor = "#e0e0e0";
        card.style.boxShadow = "none";
      }
      this.onCardHover?.(null);
    });

    // Click event
    card.addEventListener("click", () => {
      this.selectCard(index);
      this.onCardClick?.(index, data);
    });

    return card;
  }

  // ── Private: Fan layout computation ─────────────────

  private computeFanLayout(): void {
    const n = this.cards.length;
    if (n === 0) return;

    const scale = this.getScale();
    const radius = FAN_RADIUS * scale;
    const arcDeg = Math.min(FAN_ARC_DEGREES, n * 12);
    const arcRad = (arcDeg * Math.PI) / 180;
    const arcCenterY = -radius + 50 * scale;
    const tiltXRad = (CARD_TILT_X_DEG * Math.PI) / 180;

    for (let i = 0; i < n; i++) {
      const card = this.cards[i];
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const angle = t * arcRad;

      card.targetPosition = {
        x: Math.sin(angle) * radius,
        y: Math.cos(angle) * radius + arcCenterY,
        z: -Math.abs(t) * 60 * scale,
      };
      card.targetRotation = {
        x: tiltXRad,
        y: 0,
        z: -angle,
      };
      card.targetScale = scale;
      card.targetOpacity = 1;
    }
  }

  private updateTargets(): void {
    this.computeFanLayout();

    const scale = this.getScale();

    for (const card of this.cards) {
      const i = card.index;

      // Hover lift
      if (i === this.hoveredIndex && i !== this.selectedIndex) {
        card.targetPosition.y += HOVER_LIFT_Y * scale;
        card.targetPosition.z += HOVER_LIFT_Z * scale;
      }

      // Selected: enlarge card and move to center front
      if (i === this.selectedIndex) {
        // Position: center of viewport, far forward
        card.targetPosition.x = 0;
        card.targetPosition.y = 0;
        card.targetPosition.z = SELECTED_LIFT_Z * scale;
        card.targetRotation.z = 0;
        card.targetRotation.x = 0;

        // Scale up: on SP restore to full size, on PC go slightly larger
        card.targetScale = Math.max(SELECTED_SCALE_PC * scale, 1.0);
      }

      // Dim non-selected cards when one is selected
      if (this.selectedIndex >= 0 && i !== this.selectedIndex) {
        card.targetOpacity = 0.3;
      }
    }
  }

  // ── Private: Animation loop ─────────────────────────

  private animate = (): void => {
    if (!this.running) return;

    if (this.needsRender) {
      let settled = true;

      for (const card of this.cards) {
        // Lerp position
        card.currentPosition.x = this.lerp(
          card.currentPosition.x,
          card.targetPosition.x,
          LERP_FACTOR
        );
        card.currentPosition.y = this.lerp(
          card.currentPosition.y,
          card.targetPosition.y,
          LERP_FACTOR
        );
        card.currentPosition.z = this.lerp(
          card.currentPosition.z,
          card.targetPosition.z,
          LERP_FACTOR
        );

        // Lerp rotation
        card.currentRotation.x = this.lerp(
          card.currentRotation.x,
          card.targetRotation.x,
          LERP_FACTOR
        );
        card.currentRotation.y = this.lerp(
          card.currentRotation.y,
          card.targetRotation.y,
          LERP_FACTOR
        );
        card.currentRotation.z = this.lerp(
          card.currentRotation.z,
          card.targetRotation.z,
          LERP_FACTOR
        );

        // Lerp scale
        card.currentScale = this.lerp(
          card.currentScale,
          card.targetScale,
          LERP_FACTOR
        );

        // Lerp opacity
        card.currentOpacity = this.lerp(
          card.currentOpacity,
          card.targetOpacity,
          LERP_FACTOR
        );

        // Apply transforms
        card.css3dObject.position.set(
          card.currentPosition.x,
          card.currentPosition.y,
          card.currentPosition.z
        );
        card.css3dObject.rotation.set(
          card.currentRotation.x,
          card.currentRotation.y,
          card.currentRotation.z
        );
        card.css3dObject.scale.setScalar(card.currentScale);
        card.element.style.opacity = String(card.currentOpacity);

        // Check if still moving
        if (
          Math.abs(card.currentPosition.x - card.targetPosition.x) > EPSILON ||
          Math.abs(card.currentPosition.y - card.targetPosition.y) > EPSILON ||
          Math.abs(card.currentPosition.z - card.targetPosition.z) > EPSILON ||
          Math.abs(card.currentRotation.x - card.targetRotation.x) >
            EPSILON_ROT ||
          Math.abs(card.currentRotation.y - card.targetRotation.y) >
            EPSILON_ROT ||
          Math.abs(card.currentRotation.z - card.targetRotation.z) >
            EPSILON_ROT ||
          Math.abs(card.currentScale - card.targetScale) > EPSILON_SCALE ||
          Math.abs(card.currentOpacity - card.targetOpacity) > 0.01
        ) {
          settled = false;
        }
      }

      this.renderer.render(this.scene, this.camera);

      if (settled) {
        this.needsRender = false;
      }
    }

    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private lerp(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }
}
