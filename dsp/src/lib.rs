use std::f64::consts::PI;
use std::slice;

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut f32 {
    let mut v = Vec::<f32>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut f32, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// `n` is a power of two; writes n/2+1 bins to `out`.
#[no_mangle]
pub unsafe extern "C" fn power_spectrum(input: *const f32, n: usize, out: *mut f32) {
    let x = slice::from_raw_parts(input, n);
    let out = slice::from_raw_parts_mut(out, n / 2 + 1);
    let mut re: Vec<f64> = x
        .iter()
        .enumerate()
        .map(|(i, &v)| v as f64 * (0.5 - 0.5 * (2.0 * PI * i as f64 / n as f64).cos()))
        .collect();
    let mut im = vec![0.0f64; n];
    fft(&mut re, &mut im);
    for (k, o) in out.iter_mut().enumerate() {
        *o = (re[k] * re[k] + im[k] * im[k]) as f32;
    }
}

fn fft(re: &mut [f64], im: &mut [f64]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * PI / len as f64;
        for start in (0..n).step_by(len) {
            for k in 0..len / 2 {
                let (s, c) = (ang * k as f64).sin_cos();
                let (a, b) = (start + k, start + k + len / 2);
                let tr = re[b] * c - im[b] * s;
                let ti = re[b] * s + im[b] * c;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
        len <<= 1;
    }
}

/// In place. `order` even; `high` != 0 selects highpass.
#[no_mangle]
pub unsafe extern "C" fn butterworth(ptr: *mut f32, n: usize, fs: f64, fc: f64, order: u32, high: u32) {
    let x = slice::from_raw_parts_mut(ptr, n);
    let w0 = 2.0 * PI * fc / fs;
    let (sw, cw) = w0.sin_cos();
    for k in 1..=order / 2 {
        // Butterworth pole pairs as biquads: Q_k = 1 / (2 sin((2k-1)π / 2N)).
        let q = 1.0 / (2.0 * ((2 * k - 1) as f64 * PI / (2 * order) as f64).sin());
        let alpha = sw / (2.0 * q);
        let a0 = 1.0 + alpha;
        let (b0, b1) = if high != 0 { ((1.0 + cw) / 2.0, -(1.0 + cw)) } else { ((1.0 - cw) / 2.0, 1.0 - cw) };
        let (b0, b1, b2, a1, a2) = (b0 / a0, b1 / a0, b0 / a0, -2.0 * cw / a0, (1.0 - alpha) / a0);
        let (mut z1, mut z2) = (0.0f64, 0.0f64);
        for v in x.iter_mut() {
            let i = *v as f64;
            let o = b0 * i + z1;
            z1 = b1 * i - a1 * o + z2;
            z2 = b2 * i - a2 * o;
            *v = o as f32;
        }
    }
}

const ZEROS: f64 = 16.0;

/// Windowed-sinc (Blackman) interpolation, cutoff min(from, to)/2.
#[no_mangle]
pub unsafe extern "C" fn resample(input: *const f32, n: usize, from: f64, to: f64, out: *mut f32, out_n: usize) {
    let x = slice::from_raw_parts(input, n);
    let out = slice::from_raw_parts_mut(out, out_n);
    let step = from / to;
    let scale = (to / from).min(1.0);
    let half = ZEROS / scale;
    for (j, o) in out.iter_mut().enumerate() {
        let p = j as f64 * step;
        let lo = ((p - half).ceil().max(0.0)) as usize;
        let hi = ((p + half).floor() as isize).min(n as isize - 1);
        let mut acc = 0.0f64;
        let mut i = lo as isize;
        while i <= hi {
            let t = (i as f64 - p) * scale;
            let sinc = if t == 0.0 { 1.0 } else { (PI * t).sin() / (PI * t) };
            let w = 0.42 + 0.5 * (PI * t / ZEROS).cos() + 0.08 * (2.0 * PI * t / ZEROS).cos();
            acc += x[i as usize] as f64 * sinc * w;
            i += 1;
        }
        *o = (acc * scale) as f32;
    }
}
