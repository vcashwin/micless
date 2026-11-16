/** The sensors the experiment compares. `rate` is twice the highest frequency each responds to. */
export const SENSORS = [
  { id: "phone", tab: "Phone browser · 30 Hz", name: "A phone's sensor, as a browser reads it,", rate: 60, note: "Browsers hand pages about 60 readings a second",
    speaker: "No phone speaker can make sounds that low." },
  { id: "macbook", tab: "MacBook · 200 Hz", name: "The MacBook's sensor in the video", rate: 400, note: "Samples about 800 times a second, but responds only below about 200 Hz",
    speaker: "The video slowed its sentence 40×, and the MacBook's own speakers could play that." },
] as const;

export type SensorId = (typeof SENSORS)[number]["id"];

/** Slowdowns offered, from talking at the device (1×) to fitting all of speech under a 60-reading sensor (≈114×) */
export const SLOWDOWNS = [1, 10, 20, 40, 80, 120, 200] as const;
