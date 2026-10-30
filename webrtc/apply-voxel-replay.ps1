# Preserve the upstream decoder while adding readiness and seek-generation markers.
$ErrorActionPreference = 'Stop'
$basic = Join-Path $PSScriptRoot 'upstream/unitree_ui'
$clemson = Join-Path $PSScriptRoot 'clemson/unitree_ui'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$map = [IO.File]::ReadAllText((Join-Path $basic 'src/ui/scene/voxel-map.ts'))
$map = $map.Replace('  private pendingData: unknown = null;', "  private pendingData: unknown = null;`n  private workerReady = false;`n  private replayRevision = 0;")
$ready = @'
      this.worker.onmessage = (e: MessageEvent<VoxelWorkerResult>) => {
        if ((e.data as unknown as {type?: string}).type === 'clemson-ready') {
          this.workerReady = true;
          if (this.pendingData) this.processCompressed(this.pendingData);
          return;
        }
'@
$map = $map.Replace('      this.worker.onmessage = (e: MessageEvent<VoxelWorkerResult>) => {', $ready.TrimEnd())
$map = $map.Replace('        this.applyGeometry(e.data);', "        if ((e.data as unknown as {__clemson_revision?: number}).__clemson_revision !== this.replayRevision) return;`n        this.applyGeometry(e.data);")
$map = $map.Replace('    this.pendingData = data;', "    this.pendingData = data;`n    if (!this.workerReady) return;")
$map = $map.Replace('        this.worker!.postMessage(this.pendingData);', '        this.worker!.postMessage({...this.pendingData as Record<string, unknown>, __clemson_revision: this.replayRevision});')
$map = $map.Replace('  clear(): void {', "  clear(): void {`n    this.replayRevision++;`n    this.pendingData = null;`n    if (this.throttleTimer) { clearTimeout(this.throttleTimer); this.throttleTimer = null; }")
[IO.File]::WriteAllText((Join-Path $clemson 'src/ui/scene/voxel-map.ts'), $map, $utf8)
$worker = [IO.File]::ReadAllText((Join-Path $basic 'src/workers/voxel-worker.ts'))
$worker = $worker.Replace('initWasm();', "void initWasm().then(() => { if (decompressor) ctx.postMessage({type: 'clemson-ready'}); });")
$worker = $worker.Replace('ctx.postMessage({ geometryData, resolution, origin });', 'ctx.postMessage({ geometryData, resolution, origin, __clemson_revision: msg.__clemson_revision });')
[IO.File]::WriteAllText((Join-Path $clemson 'src/workers/voxel-worker.ts'), $worker, $utf8)
