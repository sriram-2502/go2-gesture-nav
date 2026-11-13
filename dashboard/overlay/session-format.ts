/** File format helpers shared by recording and the robot-free replay page. */
export type RunEvent = {t: number; kind: string; data: any};
export type RunMedia = {file: string; mime: string; offset_ms: number; bytes: number};
export type RunInfo = {
  format: 'clemson-go2-run'; version: 1; name: string; started_utc: string;
  duration_ms: number; counts: Record<string, number>; media: RunMedia[];
  limits_reached: boolean; dropped_events: number; alignment: string;
};
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

export function encodeEvent(event: RunEvent): string {
  return JSON.stringify(event, (_key, value) => {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return {__clemson_binary: btoa(binary)};
    }
    return value;
  });
}

export function decodeEvents(text: string): RunEvent[] {
  const events: RunEvent[] = [];
  let previous = -1;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const event = JSON.parse(line, (_key, value) => {
      if (value && typeof value.__clemson_binary === 'string') {
        const binary = atob(value.__clemson_binary);
        return Uint8Array.from(binary, character => character.charCodeAt(0)).buffer;
      }
      return value;
    });
    if (!Number.isFinite(event.t) || event.t < previous || event.t < 0 || typeof event.kind !== 'string')
      throw new Error('Invalid or out-of-order recording timestamps');
    previous = event.t;
    events.push(event);
  }
  return events;
}

export function atOrBefore(events: RunEvent[], time: number): number {
  let left = 0, right = events.length - 1, result = -1;
  while (left <= right) {
    const middle = (left + right) >>> 1;
    if (events[middle].t <= time) { result = middle; left = middle + 1; }
    else right = middle - 1;
  }
  return result;
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  // Prevent spreadsheet formulas when a user-controlled label begins with =,+,-,@.
  const safe = typeof value === 'number' ? text : /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function analysisFiles(events: RunEvent[]): Record<string, string> {
  const gestures = events.filter(e => e.kind === 'gesture');
  const commands = events.filter(e => e.kind === 'sent');
  const states = events.filter(e => e.kind === 'state');
  return {
    'gestures.csv': csv(['receive_ms','frame_monotonic_s','gesture','vx_requested','vy_requested','wz_requested','vx_supervised','vy_supervised','wz_supervised','status'],
      gestures.map(e => [e.t,e.data.frame_id,e.data.label,...(e.data.proposed_velocity || [0,0,0]),...(e.data.supervised_velocity || [0,0,0]),e.data.navigation_status])),
    'commands.csv': csv(['send_ms','topic','request_id','api_id','parameter','acknowledged_by_this_row'],
      commands.map(e => [e.t,e.data.topic,e.data.data?.header?.identity?.id,e.data.data?.header?.identity?.api_id,e.data.data?.parameter,false])),
    'robot_states.csv': csv(['receive_ms','vx','vy','vz','wz','body_height','position_x','position_y','position_z','robot_timestamp_if_available'],
      states.map(e => {const d=e.data; return [e.t,...(d.velocity || [null,null,null]),d.yaw_speed,d.body_height,...(d.position || [null,null,null]),d.stamp ?? d.timestamp];})),
    'events.csv': csv(['receive_ms','type','name_or_reason','control_enabled','api_id','request_id','reply_status_code'],
      events.filter(e=>['event','control','received'].includes(e.kind)).map(e=>[e.t,e.kind,e.data.name??e.data.reason,
        e.data.enabled,e.data.data?.header?.identity?.api_id,e.data.data?.header?.identity?.id,e.data.data?.header?.status?.code])),
  };
}

export function validateInfo(value: any): RunInfo {
  if (value?.format !== 'clemson-go2-run' || value.version !== 1
      || !Number.isFinite(value.duration_ms) || value.duration_ms < 0 || !Array.isArray(value.media))
    throw new Error('This is not a supported Clemson Go2 recording');
  for (const media of value.media)
    if (!/^(dashboard|robot_camera)\.(mp4|webm)$/.test(media.file)
        || !['video/mp4','video/webm'].some(type => media.mime.startsWith(type))
        || !Number.isFinite(media.offset_ms) || media.offset_ms < 0)
      throw new Error('Invalid media entry in recording');
  return value;
}

export function demoRun(): {info: RunInfo; events: RunEvent[]} {
  const compressed=Uint8Array.from(atob('HwABAP//s2YP//////jKAm8IAgAAAAgQAMsbIOAADxAAihsAoAAPEAC8DIACDwIA//////9iDIAFDwAI/////////////////////////////////////////////////////////////////////////////////////x0PAgD//////yhQAAAAAAA='), character=>character.charCodeAt(0));
  const events: RunEvent[] = [{t:0,kind:'voxel',data:{data:compressed.buffer,resolution:.1,origin:[-6.4,-6.4,0]}}];
  for (let t=0; t<=8000; t+=100) {
    const moving = t>=1500 && t<5500;
    const landmarks = moving ? [[0.5,0.88,0],[0.38,0.72,0],[0.3,0.62,0],[0.3,0.56,0],[0.4,0.62,0],[0.39,0.51,0],[0.39,0.37739999999999996,0],[0.39,0.23700000000000004,0],[0.39,0.12,0],[0.51,0.48,0],[0.51,0.39999999999999997,0],[0.545,0.485,0],[0.535,0.57,0],[0.62,0.5,0],[0.62,0.42,0],[0.655,0.505,0],[0.645,0.59,0],[0.73,0.57,0],[0.73,0.48999999999999994,0],[0.765,0.575,0],[0.755,0.6599999999999999,0]] : [[0.5,0.88,0],[0.38,0.72,0],[0.3,0.62,0],[0.19,0.53,0],[0.08000000000000002,0.45,0],[0.39,0.51,0],[0.39,0.37739999999999996,0],[0.39,0.23700000000000004,0],[0.39,0.12,0],[0.51,0.48,0],[0.51,0.344,0],[0.51,0.2,0],[0.51,0.08000000000000002,0],[0.62,0.5,0],[0.62,0.3742,0],[0.62,0.241,0],[0.62,0.13,0],[0.73,0.57,0],[0.73,0.46119999999999994,0],[0.73,0.346,0],[0.73,0.25,0]];
    events.push({t,kind:'gesture',data:{frame_id:t/1000+10,label:moving?'FORWARD':'STOP',fresh:true,landmarks:[landmarks],
      proposed_velocity:[moving?.5:0,0,0],supervised_velocity:[moving?.5:0,0,0],navigation_status:moving?'FORWARD':'STOP'}});
    events.push({t,kind:'state',data:{velocity:[moving?.35:0,0,0],yaw_speed:0,body_height:.3,position:[Math.max(0,Math.min(t-1500,4000))*.00035,0,0]}});
  }
  return {info:{format:'clemson-go2-run',version:1,name:'Demo — synthetic, no robot',started_utc:new Date(0).toISOString(),
    duration_ms:8000,counts:{gesture:81,state:81,voxel:1},media:[],limits_reached:false,dropped_events:0,alignment:'Synthetic demo with a generated voxel maze; no recorded video or robot connection'},events};
}
