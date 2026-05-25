import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { Upload, Image as ImageIcon, Sparkles } from 'lucide-react';
import { ASPECT_RATIOS, useWizard, type AspectRatio } from '../store/wizardStore';
import { FABRIC_PRESETS, makeBitset, savePattern, type FabricPreset, type Pattern } from '../lib/storage';
import { defaultStrandsFor } from '../lib/skeins';
import type { QuantizeResult } from '../lib/quantize';
import type { WorkerRequest, WorkerResponse } from '../workers/quantize.worker';

const MAX_PREVIEW_SOURCE = 600; // longest side passed to worker, for speed

function getCroppedImageData(
  imageDataUrl: string,
  area: { x: number; y: number; width: number; height: number },
  maxLongSide: number
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxLongSide / Math.max(area.width, area.height));
      const w = Math.max(1, Math.round(area.width * scale));
      const h = Math.max(1, Math.round(area.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no 2d ctx'));
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      resolve({ pixels: data.data, width: w, height: h });
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

function fabricHex(preset: FabricPreset, custom: string): string {
  if (preset === 'custom') return custom;
  return FABRIC_PRESETS.find((f) => f.id === preset)?.hex ?? '#FFFFFF';
}

function fabricName(preset: FabricPreset, custom: string): string {
  if (preset === 'custom') return `Custom ${custom.toUpperCase()}`;
  return FABRIC_PRESETS.find((f) => f.id === preset)?.name ?? 'White';
}

export function Create() {
  const w = useWizard();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<QuantizeResult | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);
  const cropAreaRef = useRef<HTMLDivElement | null>(null);
  const [cropAreaSize, setCropAreaSize] = useState({ width: 0, height: 0 });

  // Track cropper container size so free-mode crop frame can be clamped/init.
  useEffect(() => {
    const el = cropAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setCropAreaSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setCropAreaSize({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, [w.imageDataUrl]);

  // Initialise / clamp the free-mode crop frame size when entering free mode
  // or when the container resizes.
  useEffect(() => {
    if (w.aspect.id !== 'free') return;
    if (cropAreaSize.width <= 0 || cropAreaSize.height <= 0) return;
    const maxW = cropAreaSize.width;
    const maxH = cropAreaSize.height;
    if (!w.freeCropSize) {
      const s = Math.min(maxW, maxH) * 0.85;
      useWizard.setState({ freeCropSize: { width: s, height: s } });
      return;
    }
    const cw = Math.min(w.freeCropSize.width, maxW);
    const ch = Math.min(w.freeCropSize.height, maxH);
    if (cw !== w.freeCropSize.width || ch !== w.freeCropSize.height) {
      useWizard.setState({ freeCropSize: { width: cw, height: ch } });
    }
  }, [w.aspect.id, w.freeCropSize, cropAreaSize.width, cropAreaSize.height]);

  // Reset free crop size when leaving free mode so re-entry re-initialises.
  useEffect(() => {
    if (w.aspect.id !== 'free' && w.freeCropSize) {
      useWizard.setState({ freeCropSize: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.aspect.id]);

  // create worker once
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/quantize.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id === reqIdRef.current) {
        setPreview(e.data.result);
        setBusy(false);
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // image upload
  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        useWizard.setState({
          imageDataUrl: url,
          imageNaturalW: img.naturalWidth,
          imageNaturalH: img.naturalHeight,
          crop: { x: 0, y: 0 },
          zoom: 1,
          croppedAreaPixels: null,
          name: w.name || (file.name.replace(/\.[^.]+$/, '') || 'My pattern'),
        });
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const aspectRatio = w.aspect.id === 'free' ? undefined : w.aspect.w / w.aspect.h;

  const dimensions = useMemo(() => {
    if (!w.croppedAreaPixels) return { gridW: 0, gridH: 0 };
    const ar = w.croppedAreaPixels.width / w.croppedAreaPixels.height;
    const gridW = Math.max(10, Math.min(600, w.stitchesWide));
    const gridH = Math.max(10, Math.round(gridW / ar));
    return { gridW, gridH };
  }, [w.croppedAreaPixels, w.stitchesWide]);

  // Debounced live-preview regenerate
  useEffect(() => {
    if (!w.imageDataUrl || !w.croppedAreaPixels || !dimensions.gridW) return;
    const timer = setTimeout(async () => {
      try {
        setBusy(true);
        const src = await getCroppedImageData(
          w.imageDataUrl!,
          w.croppedAreaPixels!,
          MAX_PREVIEW_SOURCE
        );
        const id = ++reqIdRef.current;
        const req: WorkerRequest = {
          id,
          pixels: src.pixels,
          width: src.width,
          height: src.height,
          gridW: dimensions.gridW,
          gridH: dimensions.gridH,
          k: w.colorCount,
          fabricHex: fabricHex(w.fabricPreset, w.fabricCustomHex),
          useHalfStitches: w.useHalfStitches,
          seed: 1,
        };
        workerRef.current?.postMessage(req);
      } catch (err) {
        setBusy(false);
        console.error(err);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [
    w.imageDataUrl,
    w.croppedAreaPixels,
    dimensions.gridW,
    dimensions.gridH,
    w.colorCount,
    w.useHalfStitches,
    w.fabricPreset,
    w.fabricCustomHex,
  ]);

  // Render preview canvas whenever result changes
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !preview) return;
    const cell = 8;
    canvas.width = preview.gridW * cell;
    canvas.height = preview.gridH * cell;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = fabricHex(w.fabricPreset, w.fabricCustomHex);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < preview.gridH; y++) {
      for (let x = 0; x < preview.gridW; x++) {
        const idx = preview.cells[y * preview.gridW + x];
        if (idx === 0xff) continue;
        const entry = preview.palette[idx];
        ctx.fillStyle = entry.displayHex;
        if (entry.kind === 'full') {
          ctx.fillRect(x * cell, y * cell, cell, cell);
        } else {
          // half stitch — render as triangle (top-left → bottom-right)
          ctx.beginPath();
          ctx.moveTo(x * cell, y * cell);
          ctx.lineTo((x + 1) * cell, y * cell);
          ctx.lineTo(x * cell, (y + 1) * cell);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }, [preview, w.fabricPreset, w.fabricCustomHex]);

  const finishedSize = useMemo(() => {
    if (!dimensions.gridW) return null;
    const wIn = dimensions.gridW / w.aidaCount;
    const hIn = dimensions.gridH / w.aidaCount;
    return { wIn, hIn };
  }, [dimensions, w.aidaCount]);

  const save = useCallback(async () => {
    if (!w.imageDataUrl || !w.croppedAreaPixels || !preview) return;
    setBusy(true);
    // generate a clean thumbnail (square crop of preview)
    const thumb = document.createElement('canvas');
    const size = 256;
    thumb.width = size;
    thumb.height = size;
    const tctx = thumb.getContext('2d')!;
    tctx.fillStyle = fabricHex(w.fabricPreset, w.fabricCustomHex);
    tctx.fillRect(0, 0, size, size);
    if (previewCanvasRef.current) {
      const src = previewCanvasRef.current;
      const ratio = Math.min(size / src.width, size / src.height);
      const tw = src.width * ratio;
      const th = src.height * ratio;
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(src, (size - tw) / 2, (size - th) / 2, tw, th);
    }
    const thumbnail = thumb.toDataURL('image/png');

    const id = crypto.randomUUID();
    const pattern: Pattern = {
      id,
      name: w.name || 'Untitled',
      createdAt: Date.now(),
      gridW: preview.gridW,
      gridH: preview.gridH,
      cells: Array.from(preview.cells),
      palette: preview.palette,
      fabric: {
        name: fabricName(w.fabricPreset, w.fabricCustomHex),
        hex: fabricHex(w.fabricPreset, w.fabricCustomHex),
      },
      aidaCount: w.aidaCount,
      strands: w.strands,
      completion: makeBitset(preview.gridW * preview.gridH),
      thumbnail,
    };
    await savePattern(pattern);
    setBusy(false);
    nav(`/pattern/${id}`);
  }, [w, preview, nav]);

  return (
    <section className="stack gap-3">
      <div>
        <h1 className="page-title">
          <span className="script">Create a</span>
          New Pattern
        </h1>
        <p className="muted">Upload a photo, shape it, and stitch it into a chart.</p>
      </div>

      {!w.imageDataUrl && <UploadDropzone onFile={onFile} />}

      {w.imageDataUrl && (
        <div className="creator">
          <div className="stack gap-3">
            <div className="card stack gap-2">
              <h3>Crop &amp; frame</h3>
              <div className="crop-area" ref={cropAreaRef}>
                <Cropper
                  image={w.imageDataUrl}
                  crop={w.crop}
                  zoom={w.zoom}
                  aspect={aspectRatio}
                  cropSize={
                    w.aspect.id === 'free' && w.freeCropSize
                      ? w.freeCropSize
                      : undefined
                  }
                  onCropChange={(c) => useWizard.setState({ crop: c })}
                  onZoomChange={(z) => useWizard.setState({ zoom: z })}
                  onCropComplete={(_a, areaPixels) =>
                    useWizard.setState({ croppedAreaPixels: areaPixels })
                  }
                />
                {w.aspect.id === 'free' && w.freeCropSize && cropAreaSize.width > 0 && (
                  <FreeCropHandles
                    container={cropAreaSize}
                    size={w.freeCropSize}
                    onResize={(s) => useWizard.setState({ freeCropSize: s })}
                  />
                )}
              </div>
              <div>
                <div className="field-label">Aspect ratio</div>
                <div className="chips" style={{ marginTop: '0.4rem' }}>
                  {ASPECT_RATIOS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={'chip' + (w.aspect.id === a.id ? ' active' : '')}
                      onClick={() => useWizard.setState({ aspect: a as AspectRatio })}
                    >
                      {a.id === 'free' ? 'Free' : a.id}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => useWizard.setState({ imageDataUrl: null })}
                style={{ alignSelf: 'flex-start' }}
              >
                Choose a different photo
              </button>
            </div>

            <div className="card stack gap-3">
              <h3>Fabric</h3>
              <div className="chips">
                {FABRIC_PRESETS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={'chip' + (w.fabricPreset === f.id ? ' active' : '')}
                    onClick={() => useWizard.setState({ fabricPreset: f.id })}
                  >
                    <span className="swatch" style={{ background: f.hex }} />
                    {f.name}
                  </button>
                ))}
                <button
                  type="button"
                  className={'chip' + (w.fabricPreset === 'custom' ? ' active' : '')}
                  onClick={() => useWizard.setState({ fabricPreset: 'custom' })}
                >
                  <span className="swatch" style={{ background: w.fabricCustomHex }} />
                  Custom
                </button>
              </div>
              {w.fabricPreset === 'custom' && (
                <div className="field">
                  <label className="field-label">Custom fabric color</label>
                  <input
                    type="color"
                    value={w.fabricCustomHex}
                    onChange={(e) => useWizard.setState({ fabricCustomHex: e.target.value.toUpperCase() })}
                    style={{ height: 44, width: 80, border: 'none', background: 'transparent' }}
                  />
                </div>
              )}
            </div>

            <div className="card stack gap-3">
              <h3>Stitches &amp; threads</h3>

              <div className="field">
                <label className="field-label">
                  Aida count{' '}
                  <span className="field-hint">(stitches per inch)</span>
                </label>
                <div className="chips">
                  {[11, 14, 16, 18, 22].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={'chip' + (w.aidaCount === n ? ' active' : '')}
                      onClick={() =>
                        useWizard.setState({ aidaCount: n, strands: defaultStrandsFor(n) })
                      }
                    >
                      {n} ct
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field-label">
                  Size:{' '}
                  <span style={{ color: 'var(--ink)' }}>
                    {w.sizeUnit === 'inches'
                      ? `${(w.stitchesWide / w.aidaCount).toFixed(1)}″`
                      : `${w.stitchesWide} st`}
                  </span>{' '}
                  wide
                  {dimensions.gridH > 0 && (
                    <span className="field-hint">
                      {' '}· {dimensions.gridW}×{dimensions.gridH} st
                    </span>
                  )}
                </label>
                <div className="seg" role="tablist" aria-label="Size unit" style={{ marginBottom: '0.4rem' }}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={w.sizeUnit === 'stitches'}
                    className={'seg-btn' + (w.sizeUnit === 'stitches' ? ' active' : '')}
                    onClick={() => useWizard.setState({ sizeUnit: 'stitches' })}
                  >
                    Stitches
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={w.sizeUnit === 'inches'}
                    className={'seg-btn' + (w.sizeUnit === 'inches' ? ' active' : '')}
                    onClick={() => useWizard.setState({ sizeUnit: 'inches' })}
                  >
                    Inches
                  </button>
                </div>
                {w.sizeUnit === 'stitches' ? (
                  <input
                    type="range"
                    min={20}
                    max={400}
                    value={w.stitchesWide}
                    onChange={(e) => useWizard.setState({ stitchesWide: +e.target.value })}
                  />
                ) : (
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={0.5}
                    value={+(w.stitchesWide / w.aidaCount).toFixed(2)}
                    onChange={(e) =>
                      useWizard.setState({
                        stitchesWide: Math.max(
                          10,
                          Math.round(parseFloat(e.target.value) * w.aidaCount)
                        ),
                      })
                    }
                  />
                )}
                {finishedSize && (
                  <div className="field-hint">
                    Finished size: {finishedSize.wIn.toFixed(1)}″ × {finishedSize.hIn.toFixed(1)}″
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label">
                  Thread colors: <span style={{ color: 'var(--ink)' }}>{w.colorCount}</span>
                  {w.useHalfStitches && (
                    <span className="field-hint">
                      {' '}→ {w.colorCount * 2} effective (with half-stitches)
                    </span>
                  )}
                </label>
                <input
                  type="range"
                  min={2}
                  max={200}
                  value={w.colorCount}
                  onChange={(e) => useWizard.setState({ colorCount: +e.target.value })}
                />
              </div>

              <div className="field">
                <label className="row gap-2" style={{ cursor: 'pointer', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={w.useHalfStitches}
                    onChange={(e) => useWizard.setState({ useHalfStitches: e.target.checked })}
                  />
                  <span className="field-label" style={{ margin: 0 }}>
                    Use half-stitches
                  </span>
                </label>
                <div className="field-hint">
                  Half-stitches blend a thread with the fabric for softer shading.
                </div>
              </div>

              <div className="field">
                <label className="field-label">Strands per stitch</label>
                <div className="chips">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={'chip' + (w.strands === n ? ' active' : '')}
                      onClick={() => useWizard.setState({ strands: n })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card stack gap-2">
              <div className="field">
                <label className="field-label" htmlFor="pattern-name">Name</label>
                <input
                  id="pattern-name"
                  className="input"
                  type="text"
                  value={w.name}
                  onChange={(e) => useWizard.setState({ name: e.target.value })}
                  placeholder="A pretty pattern"
                />
              </div>
              <button
                className="btn btn-primary"
                disabled={!preview || busy}
                onClick={save}
              >
                <Sparkles size={18} /> Save to library
              </button>
            </div>
          </div>

          <div className="stack gap-2 creator-preview">
            <div className="preview-frame stack gap-2">
              <div className="row gap-2" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Live preview</h3>
                {busy && <span className="badge">stitching…</span>}
              </div>
              <div className="preview-canvas-wrap">
                <canvas ref={previewCanvasRef} />
              </div>
              {preview && (
                <div className="field-hint">
                  {preview.gridW}×{preview.gridH} stitches · {preview.threads.length} threads
                  · {preview.palette.length} symbols
                </div>
              )}
            </div>

            {preview && (
              <div className="card stack gap-1" style={{ padding: '0.75rem 1rem' }}>
                <div className="field-label">Thread palette</div>
                <div className="chips">
                  {preview.threads.map((t) => (
                    <span key={t.floss} className="chip" title={`DMC ${t.floss} ${t.name}`}>
                      <span className="swatch" style={{ background: t.hex }} />
                      {t.floss}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function UploadDropzone({ onFile }: { onFile: (file: File) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div
      className={'dropzone' + (drag ? ' drag-over' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
    >
      <ImageIcon size={36} color="var(--mauve)" />
      <h3 style={{ marginTop: '0.5rem' }}>Drag a photo here</h3>
      <p className="muted">or click to choose · JPEG, PNG, WebP</p>
      <div style={{ marginTop: '0.75rem' }}>
        <span className="btn btn-primary">
          <Upload size={16} /> Choose photo
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

interface FreeCropHandlesProps {
  container: { width: number; height: number };
  size: { width: number; height: number };
  onResize: (s: { width: number; height: number }) => void;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

const MIN_FREE_CROP = 60;

function FreeCropHandles({ container, size, onResize }: FreeCropHandlesProps) {
  const cx = container.width / 2;
  const cy = container.height / 2;
  const halfW = size.width / 2;
  const halfH = size.height / 2;
  const startRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    corner: Corner;
    pointerId: number;
  } | null>(null);

  const onPointerDown = (corner: Corner) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      corner,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = startRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // Resize symmetrically about the centre (Cropper centres cropSize).
    let dw = 0;
    let dh = 0;
    switch (s.corner) {
      case 'tl':
        dw = -dx * 2;
        dh = -dy * 2;
        break;
      case 'tr':
        dw = dx * 2;
        dh = -dy * 2;
        break;
      case 'bl':
        dw = -dx * 2;
        dh = dy * 2;
        break;
      case 'br':
        dw = dx * 2;
        dh = dy * 2;
        break;
      case 't':
        dh = -dy * 2;
        break;
      case 'b':
        dh = dy * 2;
        break;
      case 'l':
        dw = -dx * 2;
        break;
      case 'r':
        dw = dx * 2;
        break;
    }
    const width = Math.max(MIN_FREE_CROP, Math.min(container.width, s.width + dw));
    const height = Math.max(MIN_FREE_CROP, Math.min(container.height, s.height + dh));
    onResize({ width, height });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = startRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    startRef.current = null;
  };

  const handle = (corner: Corner, left: number, top: number, cursor: string) => (
    <div
      key={corner}
      className="crop-handle"
      data-corner={corner}
      style={{ left, top, cursor }}
      onPointerDown={onPointerDown(corner)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );

  return (
    <div className="crop-handles" aria-hidden>
      {handle('tl', cx - halfW, cy - halfH, 'nwse-resize')}
      {handle('tr', cx + halfW, cy - halfH, 'nesw-resize')}
      {handle('bl', cx - halfW, cy + halfH, 'nesw-resize')}
      {handle('br', cx + halfW, cy + halfH, 'nwse-resize')}
      {handle('t', cx, cy - halfH, 'ns-resize')}
      {handle('b', cx, cy + halfH, 'ns-resize')}
      {handle('l', cx - halfW, cy, 'ew-resize')}
      {handle('r', cx + halfW, cy, 'ew-resize')}
    </div>
  );
}


