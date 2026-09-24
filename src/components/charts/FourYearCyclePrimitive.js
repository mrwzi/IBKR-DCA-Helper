// A v5 pane primitive: the bands live in the chart canvas, not as a DOM overlay.
export class FourYearCyclePrimitive {
  constructor(chart, bands = []) {
    this.chart = chart;
    this.bands = bands;
    this.view = new FourYearCyclePaneView(this);
    this.requestUpdate = null;
  }

  setBands(bands) {
    this.bands = bands;
    this.requestUpdate?.();
  }

  attached({ requestUpdate }) {
    this.requestUpdate = requestUpdate;
    this.requestUpdate();
  }

  detached() {
    this.requestUpdate = null;
  }

  updateAllViews() {
    this.requestUpdate?.();
  }

  paneViews() {
    return [this.view];
  }
}

class FourYearCyclePaneView {
  constructor(primitive) {
    this.primitive = primitive;
    this.rendererInstance = new FourYearCycleRenderer(primitive);
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    return this.rendererInstance;
  }
}

class FourYearCycleRenderer {
  constructor(primitive) {
    this.primitive = primitive;
  }

  drawBackground(target) {
    const { chart, bands } = this.primitive;
    if (!chart || !bands.length) return;
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      for (const band of bands) {
        const start = chart.timeScale().timeToCoordinate(band.from);
        const end = chart.timeScale().timeToCoordinate(band.to);
        if (start == null && end == null) continue;
        const barSpacing = Number(chart.timeScale().options?.().barSpacing) || 6;
        const inclusiveEnd = band.endInclusive && end != null ? end + Math.max(2, barSpacing / 2) : end;
        const left = Math.max(0, Math.min(start ?? 0, inclusiveEnd ?? mediaSize.width));
        const right = Math.min(mediaSize.width, Math.max(inclusiveEnd ?? mediaSize.width, start ?? 0));
        if (right <= left) continue;
        context.fillStyle = 'rgba(229, 85, 95, 0.13)';
        context.fillRect(left, 0, right - left, mediaSize.height);
        const boundary = start ?? 0;
        if (boundary >= 0 && boundary <= mediaSize.width) {
          context.strokeStyle = 'rgba(255, 139, 147, 0.44)';
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(Math.round(boundary) + 0.5, 0);
          context.lineTo(Math.round(boundary) + 0.5, mediaSize.height);
          context.stroke();
        }
        if (right - left >= 72 && left < mediaSize.width - 72) {
          context.fillStyle = 'rgba(255, 177, 183, 0.82)';
          context.font = '11px Inter, system-ui, sans-serif';
          context.fillText(`${band.year} Bearish`, Math.max(6, left + 6), 17);
        }
      }
    });
  }

  draw() {}
}
