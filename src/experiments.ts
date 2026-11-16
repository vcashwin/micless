/** The sensors the experiment compares. `rate` is twice the highest frequency each responds to. */
export const SENSORS = [
  { id: "phone", label: "Phone, in a browser", rate: 60, note: "Browsers hand pages about 60 readings a second" },
  { id: "macbook", label: "MacBook, from the video", rate: 400, note: "Samples about 800 times a second, responds below about 200 Hz" },
] as const;

export type SensorId = (typeof SENSORS)[number]["id"];

/** Slowdowns offered, from talking at the device (1×) to fitting all of speech under a 60-reading sensor (≈114×) */
export const SLOWDOWNS = [1, 10, 20, 40, 80, 120, 200] as const;
