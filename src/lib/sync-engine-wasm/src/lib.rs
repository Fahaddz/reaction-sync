use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SyncEngine {
    is_synced: bool,
    delay: f64,
    is_seeking: bool,
    is_user_interacting: bool,
    last_interaction_time: f64,
    seeking_source: Option<String>,
}

#[wasm_bindgen]
impl SyncEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            is_synced: false,
            delay: 0.0,
            is_seeking: false,
            is_user_interacting: false,
            last_interaction_time: 0.0,
            seeking_source: None,
        }
    }

    #[wasm_bindgen]
    pub fn sync_videos(&mut self, base_time: f64, react_time: f64, force: bool) -> f64 {
        if !self.is_synced {
            return 0.0;
        }

        if self.is_seeking && !force {
            return 0.0;
        }

        let now = js_sys::Date::now();
        let time_since_interaction = now - self.last_interaction_time;
        if !force && self.is_user_interacting && time_since_interaction < 1600.0 {
            return 0.0;
        }

        let target_react_time = base_time + self.delay;
        let time_diff = (react_time - target_react_time).abs();
        let threshold = self.get_sync_threshold();

        if force || (time_diff > threshold && !self.is_seeking) {
            if force {
                target_react_time
            } else {
                react_time + (target_react_time - react_time) * 0.5
            }
        } else {
            0.0
        }
    }

    #[wasm_bindgen]
    pub fn sync_seek_base(&self, target_time: f64) -> f64 {
        (target_time + self.delay).max(0.0)
    }

    #[wasm_bindgen]
    pub fn sync_seek_react(&self, target_time: f64) -> f64 {
        (target_time - self.delay).max(0.0)
    }

    #[wasm_bindgen]
    pub fn get_sync_threshold(&self) -> f64 {
        let base = (self.delay.abs() * 0.05).max(0.3);
        base.min(1.0)
    }

    #[wasm_bindgen]
    pub fn get_sync_interval(&self) -> u32 {
        let threshold = self.get_sync_threshold();
        let interval = (threshold * 1000.0) as u32;
        interval.max(200).min(1000)
    }

    #[wasm_bindgen]
    pub fn mark_seeking(&mut self, source: String) {
        self.is_seeking = true;
        self.seeking_source = Some(source);
        self.last_interaction_time = js_sys::Date::now();
    }

    #[wasm_bindgen]
    pub fn clear_seeking(&mut self) {
        self.is_seeking = false;
        self.seeking_source = None;
    }

    #[wasm_bindgen]
    pub fn mark_user_interaction(&mut self) {
        self.is_user_interacting = true;
        self.last_interaction_time = js_sys::Date::now();
    }

    #[wasm_bindgen]
    pub fn clear_user_interaction(&mut self) {
        self.is_user_interacting = false;
    }

    #[wasm_bindgen]
    pub fn set_delay(&mut self, delay: f64) {
        self.delay = delay;
    }

    #[wasm_bindgen]
    pub fn get_delay(&self) -> f64 {
        self.delay
    }

    #[wasm_bindgen]
    pub fn set_synced(&mut self, synced: bool) {
        self.is_synced = synced;
    }

    #[wasm_bindgen]
    pub fn is_synced(&self) -> bool {
        self.is_synced
    }

    #[wasm_bindgen]
    pub fn is_seeking(&self) -> bool {
        self.is_seeking
    }

    #[wasm_bindgen]
    pub fn is_user_interacting(&self) -> bool {
        self.is_user_interacting
    }
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self::new()
    }
}

