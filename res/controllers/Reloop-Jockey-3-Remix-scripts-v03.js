// Jockey 3 Remix Mapping v0.1

// Sources:
// Manual: https://www.reloop.com/reloop-jockey-3-remix
// Promotional walkthrough:
//  Introduction: https://youtu.be/3jeoWXwCweg
//  Detailed overview: https://youtu.be/0sEsk1mhqIU
//  Sample mode: https://youtu.be/sAwmGvt04PQ
//  Remix mode: https://youtu.be/pF1YL-HrZWg
//  Advanced features: https://youtu.be/RxzB1_H2Lv8

// Mixxx
//   Controls list: https://manual.mixxx.org/2.3/en/chapters/appendix/mixxx_controls.html
//   Control index: https://manual.mixxx.org/2.3/en/mixxx-control.html
//   Scripting primer: https://github.com/mixxxdj/mixxx/wiki/MIDI%20scripting
//   Midi crash course: https://github.com/mixxxdj/mixxx/wiki/MIDI%20crash%20course
//   Mapping format: https://github.com/mixxxdj/mixxx/wiki/MIDI%20controller%20mapping%20file%20format


//const script = {};
//const midi = {};
//const engine = {};

const T2_DryWet_code = 0x1D;
const T3_EffectP1_code = 0x1E;
const T14_Beatshifts_code = 0x05;
const T14_shift_Beatshifts_code = 0x44;
const T15_LoopIn_light_code = T14_Beatshifts_code + 1;
const T15_shift_LoopIn_light_code = T14_shift_Beatshifts_code + 1;
const T15_LoopOut_light_code = T14_Beatshifts_code + 2;
const T15_shift_LoopOut_light_code = T14_shift_Beatshifts_code + 2;
const T20_Hotcues_code = 0x0B;
const T20_shift_Hotcues_code = 0x4A;

function DeckState(deckNum, sampleDeck) {
	this.deckNum = deckNum;
	this.sampleMode = sampleDeck;
	this.sampleDeck = sampleDeck;
}

DeckState.prototype =
{
	deckNum: 0,
	moveLoopPressed: 0, // 1 = pressed, -1 = pressed and turned, 0 = unpressed.
	cupDown: 0, // 1 = pressed, -1 = pressed and play pressed, 0 = unpressed.
	sampleMode: false,
	sampleDeck: false,
	hotcueButtonConnections: [],
	slipScratch: false, // truthy if in slip-scrath.
	selectedSamples: [] // selected samples on a sample deck.
};

function Jockey3RM() { }

// Variables
Jockey3RM.connections = []; // Unused?
Jockey3RM.effectsConnections = []; // effect unit indicators
Jockey3RM.traxPressedTime = 0; // 0 = unpressed, >0 = time it was pressed, -1 = pressed and turned 
// Currently 0-based; maybe should be 1-based for ease of use?
Jockey3RM.decks = [new DeckState(1, false), new DeckState(2, false), new DeckState(3, true), new DeckState(4, true)];

// All the configurable options:
Jockey3RM.options =
{
	betterTrax: true,          // trax usability improvements
	cupLikeHotcue: true,       // CUP will behave similar to a hotcue
	decksCandD: true,          // Decks C and D are standard decks (not "sample decks") - remove?
	keylockSampleDecks: true,  // set keylock for all sample decks
	minMoveLoop: (1 / 32),     // Min move/ loop size in beats
	maxMoveLoop: 128,          // Max move/ loop size in beats
	bpmJogScale: 0.1,          // Scale to use for bpm jog control.
	jogwheelResolution: 2048,  // Jogwheel resolution, as configured in controller.
	jogwheelSpinSpeed: 33.33   // Effective jogwheel rpm
};

Jockey3RM.superKnobxxx = 0;

// This is controlled by Jogwheel REMIX mode.
Jockey3RM.remixEffectSuperKnob = function (channel, control, value, status, group) {
	// Mixxx seems to struggle to process midi events if lots of changes are made too effects quickly
	// Batch the changes up for now - this is really hacky and left like this as I'm not at all happy
	// with it only being available in REMIX mode.
	var newValue = (value - 64);
	var scale = 0.0005;

	Jockey3RM.superKnobxxx += (scale * newValue);

	if (Jockey3RM.superKnobxxx > 0.02 || Jockey3RM.superKnobxxx < -0.02) {
		//group="[EffectRack1_EffectUnit" + currentDeck + "]"
		var curVal = engine.getParameter(group, "super1");
		newValue = curVal + Jockey3RM.superKnobxxx;
		Jockey3RM.superKnobxxx = 0;
		engine.setParameter(group, "super1", newValue);
	}
};

Jockey3RM.effectVal = 0;

//Jockey3RM.tryChain = function (channel, control, value, status, group) {
//	var newValue = (value - 0x40);
//	//engine.setParameter(group, "chain_selector", newValue > 0 ? 1 : -1);
//	group = "[EffectRack1_EffectUnit2_Effect1]";
//	Jockey3RM.effectVal  += newValue;
//	engine.setParameter(group, "clear", 1);
//	for (var i = 0; i < Jockey3RM.effectVal; i++) {
//		engine.setParameter(group, "effect_selector", 1);
//	}
//};



// VALidaTED functinatllity!!


// --- INIT ---

// Init Script at Program start
Jockey3RM.init = function () {
	/// Clear the board
	for (var v = 0; v < 2; v++) {
		var val = v > 0 ? 0x00 : 0x7F;
		var limit = v > 0 ? 0x80 : 0x20; // Light up visible stuff but clear everything.
		for (var d = 0; d < 4; d++) {
			var did = [0, 2, 1, 3][d]; // Left deck then right deck.
			for (var i = 0; i < limit; i++) {
				midi.sendShortMsg(0x90 + did, i, val);
			}
		}
	}

	// Wire up the lights for the expected initial configuration of Deck A & B selected
	
	this.wireUpHotcueLights("[Channel1]");
	this.wireUpHotcueLights("[Channel2]");
	this.wireUpSampleLights("[Channel3]");
	this.wireUpSampleLights("[Channel4]");

	this.wireUpEffectsLights(1);
	this.wireUpEffectsLights(2);

	// set soft takeover for all likely knobs
	for (var k = 1; k <= 4; k++) {
		this.setSoftTakeover(k);
	}

	// Set sensible default sampler states (particularly some hidden controls)
	for (var k = 1; k <= 8; k++) {
		var samplerName = "[Sampler" + k + "]";
		engine.setParameter(samplerName, "mute", 0);
		engine.setParameter(samplerName, "rate", 0);
		engine.setParameter(samplerName, "volume", 1);
		if (Jockey3RM.options.keylockSampleDecks) {
			engine.setParameter(samplerName, "keylock", 1);
		}
	}
};


Jockey3RM.setSoftTakeover = function (channelNum) {
	var group = "[Channel" + channelNum + "]";

	for (var l = 1; l <= 3; l++) {
		engine.softTakeover("[EqualizerRack1_" + group + "_Effect1]", "parameter" + l, false);
		engine.softTakeover("[EqualizerRack1_" + group + "_Effect1]", "parameter" + l, true);
	}
	engine.softTakeover(group, "volume", false);
	engine.softTakeover(group, "volume", true);
	engine.softTakeover(group, "pregain", false);
	engine.softTakeover(group, "pregain", true);
	engine.softTakeover(group, "rate", false);
	engine.softTakeover(group, "rate", true);
};

Jockey3RM.shutdown = function () {
	// Unused?
	this.connections.forEach(function (i) { i.disconnect(); });
	this.connections = [];

	this.effectsConnections.forEach(function (i) { i.disconnect(); });
	this.effectsConnections = [];

	this.decks.forEach(function (deck) {
		deck.hotcueButtonConnections.forEach(function (i) { i.disconnect(); });
		deck.hotcueButtonConnections = [];
	});

	for (var d = 0; i < 4; i++) {
		for (var i = 0; i < 0x80; i++) {
			midi.sendShortMsg(0x90 + d, i, 0x00);
		}
	}
};



// --- TRAX ---

Jockey3RM.traxEncoderPress = function (channel, control, value, status, group) {
	if (value > 0x40) {
		this.traxPressedTime = Date.now();
	} else {
		if (this.options.betterTrax) {
			if (this.traxPressedTime > 0) {
				// Hold to maximize/ minimize
				if ((Date.now() - this.traxPressedTime) > 250) {
					this.maximizeLibraryToggle();
				} else {
					// Click to preview, or stop preview
					if (engine.getValue("[PreviewDeck1]", "play")) {
						engine.setValue("[PreviewDeck1]", "stop", 1);
					} else {
						engine.setValue("[PreviewDeck1]", "LoadSelectedTrackAndPlay", 1);
					}
				}
			}
		} else {
			this.maximizeLibraryToggle();
		}

		this.traxPressedTime = 0;
	}
};

Jockey3RM.maximizeLibraryToggle = function () {
	var maximized = engine.getValue("[Master]", "maximize_library");
	engine.setValue("[Master]", "maximize_library", !maximized);
};

// Browser Knob to Browse the Playlist
Jockey3RM.traxEncoderTurn = function (channel, control, value, status, group) {
	if (this.options.betterTrax && this.traxPressedTime !== 0) {
		// Hold and turn to change crate.
		this.traxPressedTime = -1;
		this.shiftTraxEncoderTurn(channel, control, value, status, group);
	} else {
		// Turn to select track.
		var newValue = value - 0x40;
		engine.setValue(group, "SelectTrackKnob", newValue);
	}
};

// Browser Knob with Shift to Browse the Playlist Tree
Jockey3RM.shiftTraxEncoderTurn = function (channel, control, value, status, group) {
	var newValue = (value - 64);
	//engine.setValue("[Library]", "MoveVertical", newValue);
	if (newValue > 0) {
		engine.setValue("[Playlist]", "SelectNextPlaylist", 1);
	} else {
		engine.setValue("[Playlist]", "SelectPrevPlaylist", 1);
	}
};


// --- DECK SWITCHES ---

Jockey3RM.deckSwitch = function (channel, control, value, status, group) {
	var ch = 0;

	// What about analog/ aux inputs?

	if (control === 0x3C && value === 0x7F) {
		ch = 3;
	} else if (control === 0x3C && value === 0x00) {
		ch = 1;
		this.decks[3 - 1].sampleMode = true;
	} else if (control === 0x3F && value === 0x7F) {
		ch = 4;
	} else if (control === 0x3F && value === 0x00) {
		ch = 2;
		this.decks[4 - 1].sampleMode = true;
	}

	if (ch > 0) {
		this.wireUpHotcueLights("[Channel" + ch + "]");
		this.setSoftTakeover(ch);
	}
};


Jockey3RM.wireUpHotcueLights = function (group) {
	// Hotcues & beatjumps on the non-sample layer of Deck C/D *actually* use the light values
	// from Deck A/B - thus we save the connections to that DeckState,
	// otherwise the current connections on A/B won't get removed appropriately.

	var deckNum = script.deckFromGroup(group);
	var targetGrp = deckNum < 3 ? group : "[Channel" + (deckNum - 2) + "]";
	var deck = this.deckStateFromGroup(targetGrp);

	deck.hotcueButtonConnections.forEach(function (i) { i.disconnect(); });
	deck.hotcueButtonConnections = [];

	for (var i = 0; i < 4; i++) {
		var handle = engine.makeConnection(group, "hotcue_" + (i + 1) + "_enabled", this.hotcueLightsCallback);
		deck.hotcueButtonConnections.push(handle);
		handle.trigger();
	}

	// Beatjump/ loop in/out lights

	var h1 = engine.makeConnection(group, "loop_start_position", this.loopLocationLightsCallback);
	deck.hotcueButtonConnections.push(h1);
	h1.trigger();
	var h2 = engine.makeConnection(group, "loop_end_position", this.loopLocationLightsCallback);
	deck.hotcueButtonConnections.push(h2);
	h2.trigger();
	var h3 = engine.makeConnection(group, "loop_enabled", this.loopActiveLightsCallback);
	deck.hotcueButtonConnections.push(h3);
	h3.trigger();
};


Jockey3RM.wireUpSampleLights = function (group) {
	// group = "[Channel3]" or "[Channel4]"
	var deckNum = script.deckFromGroup(group);
	var deck = this.decks[deckNum - 1];

	deck.hotcueButtonConnections.forEach(function (i) { i.disconnect(); });
	deck.hotcueButtonConnections = [];

	var offset = deckNum & 0x01 ? 1 : 5;

	// Beatjump (sample play/mute) group

	for (var i = 0; i < 4; i++) {
		var handle = engine.makeConnection("[Sampler" + (i + offset) + "]", "track_loaded", this.sampleLoadedCallback);
		deck.hotcueButtonConnections.push(handle);
		handle.trigger();
	}

	// TODO: Some indication that the sample is playing?
};

Jockey3RM.loopLocationLightsCallback = function (value, group, key) {
	var deckNum = script.deckFromGroup(group);
	deckNum = deckNum > 2 ? deckNum - 2 : deckNum; // Effective deck will be A or B.
	var loopInSet = engine.getValue(group, "loop_start_position") !== -1;
	var loopOutSet = engine.getValue(group, "loop_end_position") !== -1;

	if (key === "loop_start_position") {
		midi.sendShortMsg(0x90 + deckNum - 1, T15_shift_LoopIn_light_code, loopInSet ? 0x7f : 0x00);
	} else {
		midi.sendShortMsg(0x90 + deckNum - 1, T15_shift_LoopOut_light_code, loopOutSet ? 0x7f : 0x00);
	}

	midi.sendShortMsg(0x90 + deckNum - 1, T15_LoopOut_light_code, (loopInSet && loopOutSet) ? 0x7f :0x00);
};

Jockey3RM.loopActiveLightsCallback = function (value, group, key) {
	var deckNum = script.deckFromGroup(group);
	deckNum = deckNum > 2 ? deckNum-2 : deckNum; // Effective deck will be A or B.

	midi.sendShortMsg(0x90 + deckNum - 1, T15_LoopIn_light_code, value ? 0x7f : 0x00);
};

Jockey3RM.hotcueLightsCallback = function (value, group, key) {
	// group = "[Channel?]" where ? = 1-4
	var h = parseInt(key.substring(7, 8)); // ="hotcue_?_enabled"
	var deckNum = script.deckFromGroup(group);

	// When sample mode is off on a secondary deck, the *primary deck* hotcues are shown.
	// (When they are pressed, they still send codes for the secondary deck!)
	// (Compare with effects controls, which always send primary deck codes in non-sample mode!)
	deckNum = deckNum > 2 ? deckNum - 2 : deckNum; // Effective deck will be A or B.

	midi.sendShortMsg(0x90 + deckNum - 1, T20_Hotcues_code + h - 1, value ? 0x7f : 0x00);
	midi.sendShortMsg(0x90 + deckNum - 1, T20_shift_Hotcues_code + h - 1, value ? 0x7f : 0x00);
};

Jockey3RM.sampleLoadedCallback = function (value, group, key) {
	engine.setParameter(group, "mute", 0); // Turn off mute in case it was left on!
	engine.setParameter(group, "rate", 0); // Ditto rate could be anywhere!
	engine.setParameter(group, "pregain", 1); // Ditto pregain...
	var s = parseInt(group.substring(8, 9)); // ="[sampler?]"

	// 1-4 = deck C; 5-8 = deck D
	var deckId = s < 5 ? 2 : 3;
	var btnOffset = (s - 1) % 0x04;

	midi.sendShortMsg(0x90 + deckId, T20_Hotcues_code + btnOffset, value ? 0x50 : 0x00);
	midi.sendShortMsg(0x90 + deckId, T20_shift_Hotcues_code + btnOffset, value ? 0x50 : 0x00);

	midi.sendShortMsg(0x90 + deckId, T14_Beatshifts_code + btnOffset, value ? 0x7f : 0x00);
	midi.sendShortMsg(0x90 + deckId, T14_shift_Beatshifts_code + btnOffset, value ? 0x7f : 0x00);
};

// --- EFFECTS SECTION ---

Jockey3RM.wireUpEffectsLights = function (unitNum) {
	// unitNum = 1 or 2
	var unit = "EffectRack1_EffectUnit" + unitNum;
	var h = engine.makeConnection("[" + unit + "]", "mix", Jockey3RM.linearLightsCallback(unitNum, T2_DryWet_code));
	h.trigger();
	for (var i = 1; i <= 3; i++) {
		var name = "[" + unit + "_Effect"+i+"]";
		h = engine.makeConnection(name, "meta", Jockey3RM.linearLightsCallback(unitNum, T3_EffectP1_code + i - 1));
		Jockey3RM.effectsConnections.push(h);
		h.trigger();
	}
};

Jockey3RM.linearLightsCallback = function (chan, code) {
	return function (value, group, key) {
		midi.sendShortMsg(0x90 + chan - 1, code, Math.floor(value * 0x7f));
	}
};

Jockey3RM.effectDryWet = function (channel, control, value, status, group) {
	//group = "[EffectRack1_EffectUnit?]"; 
	var newValue = script.absoluteLin(value, 0, 1);
	engine.setParameter(group, "mix", newValue);
};


Jockey3RM.effectParameter = function (channel, control, value, status, group) {
	//group = "[EffectRack1_EffectUnitN_EffectX"]"
	var loaded = engine.getValue(group, "loaded");
	linValue = script.absoluteLin(value, 0, 1);
	if (loaded) {
		engine.setParameter(group, "meta", linValue);
	}
};

Jockey3RM.effectEnable = function (channel, control, value, status, group) {
	// group = "[EffectRack1_EffectUnitN_EffectX"]"
	if (value > 0x40) {
		script.toggleControl(group, "enabled");
	}
};


Jockey3RM.effectChainEnable = function (channel, control, value, status, group) {
	//group="[EffectRack1_EffectUnit?]"
	if (value > 0x40) {
		script.toggleControl(group, "enabled");
	}
};


Jockey3RM.effectSelect = function (channel, control, value, status, group) {
	//group = "[EffectRack1_EffectUnit?_Effect?]"
	var newValue = (value - 0x40);
	engine.setValue(group, "effect_selector", newValue > 0 ? 1 : -1);
};

Jockey3RM.effectMixMode = function (channel, control, value, status, group) {
	//group="[EffectRack1_EffectUnit?]"
	if (value > 0x40) {
		script.toggleControl(group, "mix_mode"); // undocumented
	}
};

// TODO: Indicate mix mode


// --- MIXER SECTION ---

Jockey3RM.channelGain = function (channel, control, value, status, group) {
	//group = "[Channel?]"
	engine.setValue(group, "pregain", script.absoluteNonLin(value, 0, 1, 4));
};

Jockey3RM.expoScale = function (value, limit) {
	return script.absoluteLin(value, 0, script.absoluteLin(value, 0, limit ? limit : 4, 0, 127), 0, 127);
};

Jockey3RM.channelHiEq = function (channel, control, value, status, group) {
	this.channelEq(group, 3, value);
};

Jockey3RM.channelHiEq_kill = function (channel, control, value, status, group) {
	this.channelEq_kill(group, 3, value);
};

Jockey3RM.channelMidEq = function (channel, control, value, status, group) {
	this.channelEq(group, 2, value);
};

Jockey3RM.channelMidEq_kill = function (channel, control, value, status, group) {
	this.channelEq_kill(group, 2, value);
};

Jockey3RM.channelLowEq = function (channel, control, value, status, group) {
	this.channelEq(group, 1, value);
};

Jockey3RM.channelLowEq_kill = function (channel, control, value, status, group) {
	this.channelEq_kill(group, 1, value);
};

Jockey3RM.channelEq = function (group, knobId, value) {
	// group = "[EqualizerRack1_[Channel?]_Effect1]"
	engine.setValue(group, "parameter" + knobId, script.absoluteNonLin(value, 0, 1, 4));
};

Jockey3RM.channelEq_kill = function (group, buttonId, value) {
	// group = "[EqualizerRack1_[Channel?]_Effect1]"
	engine.setValue(group, "button_parameter" + buttonId, value > 0x40 ? 1 : 0);
};


Jockey3RM.faderStart = function (channel, control, value, status, group) {
	// group = "[Channel?]"
	if (value > 0x40) {
		engine.setValue(group, "play", 1);
	} else {
		engine.setValue(group, "play", 0);
	}
};

Jockey3RM.faderVol = function (channel, control, value, status, group) {
	// group = "[Channel?]"
	engine.setValue(group, "volume", script.absoluteNonLin(value, 0, 0.25, 1));
};


Jockey3RM.crossfaderCurve = function (channel, control, value, status, group) {
	script.crossfaderCurve(value, 0, 127);
};


// TRANSPORT SECTION

Jockey3RM.playPressed = function (channel, control, value, status, group) {
	if (value > 0x40) {
		var deckState = this.deckStateFromGroup(group);
		print("PLAY-CUPLDOWN====" + deckState.cupDown);
		if (deckState.cupDown !== 0) {
			// Only true when options.cupLikeHotcue is on.
			deckState.cupDown = -1;
		} else {
			Jockey3RM.sampleAwareToggle(deckState, group, "play");
		}
	}
};

Jockey3RM.sampleAwareToggle = function (deckState, group, key) {
	if (deckState.sampleDeck && deckState.sampleMode) {
		Jockey3RM.applyToSamplers(
			deckState.selectedSamples,
			function (s, v) { engine.setValue(s, key, v >= 0.5 ? 0 : 1); },
			function (s) { return engine.getValue(s, key); });
	} else {
		var playing = engine.getValue(group, key);
		engine.setValue(group, key, !playing);
	}
};

Jockey3RM.cupPressed = function (channel, control, value, status, group) {
	if (this.options.cupLikeHotcue) {
		this.doCupLikeHotcue(channel, control, value, status, group);
	} else {
		// Defined behaviour is to seek to cue, and then play when released
		if (value > 0x40) {
			engine.setValue(group, "cue_gotoandstop", 1);
		} else {
			engine.setValue(group, "play", 1);
		}
	}
};

Jockey3RM.doCupLikeHotcue = function (channel, control, value, status, group) {
	// Play from hotcue; stop when released - unless play is pressed whilst cup is held.
	var deckState = this.deckStateFromGroup(group);
	if (value > 0x40) {
		if (deckState.sampleDeck && deckState.sampleMode) {
			var avg = Jockey3RM.applyToSamplers(
				deckState.selectedSamples,
				function (s) { engine.setValue(s, "cue_gotoandplay", 1); },
				function (s) { return engine.getValue(s, "play"); });
			deckState.cupDown = avg >= 0.5 ? -1 : 1; // if already playing, keep playing.
		} else {
			deckState.cupDown = engine.getValue(group, "play") ? -1 : 1; // if already playing, keep playing.
			engine.setValue(group, "cue_gotoandplay", 1);
		}
	} else {
		if (deckState.cupDown!==-1) {
			if (deckState.sampleDeck && deckState.sampleMode) {
				Jockey3RM.applyToSamplers(
					deckState.selectedSamples,
					function (s) { engine.setValue(s, "cue_gotoandstop", 1); });
			} else {
				engine.setValue(group, "cue_gotoandstop", 1);
			}
		}
		deckState.cupDown = 0;
	}
};


Jockey3RM.keylockPressed = function (channel, control, value, status, group) {
	if (value > 0x40) {
		var deckState = this.deckStateFromGroup(group);
		Jockey3RM.sampleAwareToggle(deckState, group, "keylock");
	}
};

Jockey3RM.quantizePressed = function (channel, control, value, status, group) {
	if (value > 0x40) {
		var deckState = this.deckStateFromGroup(group);
		Jockey3RM.sampleAwareToggle(deckState, group, "quantize");
	}
};

// JOGWHEEL SECTION


// The button that enables/disables scratching 
//   - also used to hold track during search if platter is touched.
Jockey3RM.wheelTouch = function (channel, control, value, status, group) {
	var currentDeck = script.deckFromGroup(group);

	if (value > 0x40) {
		var alpha = 1.0 / 8;
		var beta = alpha / 32;
		engine.scratchEnable(currentDeck, Jockey3RM.options.jogwheelResolution, Jockey3RM.options.jogwheelSpinSpeed, alpha, beta);
	}
	else {    // If button up
		engine.scratchDisable(currentDeck);
		var deckState = Jockey3RM.deckStateFromGroup(group);
		if (deckState.slipScratch) {
			// The scratch can continue to run briefly even after we've disabled it.
			// The timer helps mitigate this, but it's still not great!
			deckState.slipScratch = false;
			engine.beginTimer(100, function () { engine.setValue(group, "slip_enabled", 0); }, 1);
        }
	}
};

// The wheel that actually controls the scratching/ bpm shift.
Jockey3RM.wheelTurn = function (channel, control, value, status, group) {
	var newValue = (value - 0x40);
	var currentDeck = script.deckFromGroup(group);

	if (engine.isScratching(currentDeck)) {
		engine.scratchTick(currentDeck, newValue);
	} else {
		// Jog pitch/ bpm if platter not touched, or not in scratch mode.
		engine.setValue(group, "jog", newValue * Jockey3RM.options.bpmJogScale);
	}
};

Jockey3RM.wheelTouchShift = function (channel, control, value, status, group) {
	var deckState = Jockey3RM.deckStateFromGroup(group);

	if (!deckState.slipScratch) {
		deckState.slipScratch = true;
		engine.setValue(group, 'slip_enabled', 1);
	}
	Jockey3RM.wheelTouch(channel, control, value, status, group);
}


// Jogwheel Search Mode
Jockey3RM.trackSearch = function (channel, control, value, status, group) {
	var newValue = (value - 0x40);
	if (newValue > 1 || newValue < -1) {
		newValue /= 2;
	}
	engine.setValue(group, "beatjump", newValue);
};



// HOTCUES // SAMPLES

// These share the same buttons, but the channel codes can get a bit odd, as the 
// "samples" button always makes them refer to the secondary deck - so we have to keep 
// track of the samples mode separately! 
// This is complicated by the secondary deck ALWAYS being in sample mode when returning to it.

Jockey3RM.hotcueOrSamplePressed = function (channel, control, value, status, group) {
	// We'll switch secondary deck back to "sample mode" when we switch AWAY from it, 
	// so it has the right value when we get here :-)
	if (this.deckStateFromGroup(group).sampleMode) {
		this.sample_activate(channel, control, value, status, group);
	} else {
		if (Jockey3RM.options.decksCandD) {
			this.hotcue_activate(channel, control, value, status, group);
		} else {
			// TODO: Seek all samples to hotcue?
        }
	}
};

Jockey3RM.hotcueOrSamplePressedShift = function (channel, control, value, status, group) {
	if (this.deckStateFromGroup(group).sampleMode) {
		this.sample_loadClear(channel, control, value, status, group);
	} else {
		if (Jockey3RM.options.decksCandD) {
			this.hotcue_clear(channel, control, value, status, group);
		} else {
			// TODO: Seek all samples to hotcue? delete hotcue in all samples?!
        }
	}
};


// Hotcues
Jockey3RM.hotcue_activate = function (channel, control, value, status, group) {
	var number = control - T20_Hotcues_code + 1;
	engine.setValue(group, "hotcue_" + number + "_activate", value > 0x40 ? 1 : 0);
};

Jockey3RM.hotcue_clear = function (channel, control, value, status, group) {
	if (value > 0x40) {
		var number = control - T20_shift_Hotcues_code + 1;
		engine.setValue(group, "hotcue_" + number + "_clear", 1);
	}
};


// Samples

Jockey3RM.sample_activate = function (channel, control, value, status, group) {
	// group will always be either Channel2 or Channel4.
	if (value > 0x40) {
		var deck = script.deckFromGroup(group);
		var number = control - T20_Hotcues_code + 1 + ((deck & 2) ? 0 : 4);
		var samplerName = "[Sampler" + number + "]";
		var playing = engine.getValue(samplerName, "play");

		if (playing) {
			engine.setValue(samplerName, "play_stutter", 1);
		} else {
			engine.setValue(samplerName, "repeat", 0);
			engine.setValue(samplerName, "cue_gotoandplay", 1);
		}
	}
};

Jockey3RM.sample_loadClear = function (channel, control, value, status, group) {
	if (value > 0x40) {
		var deck = script.deckFromGroup(group);
		var number = control - T20_shift_Hotcues_code + 1 + ((deck & 2) ? 0 : 4);
		var samplerName = "[Sampler" + number + "]";
		var loaded = engine.getValue(samplerName, "track_loaded");

		if (loaded) {
			//engine.setValue(samplerName, "play", 0);
			engine.setValue(samplerName, "eject", 1);
			engine.setValue(samplerName, "eject", 0);
		} else {
			engine.setValue(samplerName, "LoadSelectedTrack", 1);
		}
	}
};

// BEATJUMP/LOOP // SAMPLE CONTROL SECTION

Jockey3RM.sampleCtrlOrJumpLoop = function (sampler, jump) {
	return function (channel, control, value, status, group) {
		var deck = Jockey3RM.deckStateFromGroup(group);
		if (value > 0x40) {
			if (deck.sampleMode) {
				Jockey3RM.sampleControlPressed(sampler);
			} else if (Jockey3RM.options.decksCandD) {
				Jockey3RM.jumpOrLoopPressed(group, jump);
			} else {
				// TODO: Beatjump/ loop all samples??
			}
		}
	};
};

Jockey3RM.sampleCtrlOrJumpLoopShifted = function (sampler, jump) {
	return function (channel, control, value, status, group) {
		var deck = Jockey3RM.deckStateFromGroup(group);
		if (value > 0x40) {
			if (deck.sampleMode) {
				Jockey3RM.sampleControlPressedShifted(sampler);
			} else if (Jockey3RM.options.decksCandD) {
				Jockey3RM.jumpOrLoopPressed(group, jump);
			} else {
				// TODO: Beatjump/ loop all samples??
            }
		}
	};
};

Jockey3RM.sampleControlPressed = function (sampler) {
	// T14-T17 pressed in sample mode
	var samplerName = "[Sampler" + sampler + "]";
	var playing = engine.getValue(samplerName, "play");

	if (!playing) {
		engine.setValue(samplerName, "repeat", 1);
		engine.setValue(samplerName, "mute", 0);
		engine.setValue(samplerName, "play", 1);  // gotocueandplay?
	} else {
		var muted = engine.getValue(samplerName, "mute");
		engine.setValue(samplerName, "mute", muted ? 0 : 1);
	}
};

// TODO: Indicate muted sample.

Jockey3RM.sampleControlPressedShifted = function (sampler) {
	// T14-T17 pressed with shift in sample mode
	var samplerName = "[Sampler" + sampler + "]";
	var playing = engine.getValue(samplerName, "play");

	if (playing) {
		engine.setValue(samplerName, "cue_gotoandstop", 1);
	} else {
		engine.setValue(samplerName, "LoadSelectedTrack", 1);
	}
};

Jockey3RM.jumpOrLoopPressed = function (group, jump) {
	// T14-T17 pressed in normal mode
	if (jump === "in") {
		engine.setValue(group, "loop_in", 1);
	} else if (jump === "out") {
		engine.setValue(group, "loop_out", 1);
	} else if (jump > 0) {
		engine.setValue(group, "beatjump_" + jump + "_forward", 1);
	} else {
		engine.setValue(group, "beatjump_" + (-jump) + "_backward", 1);
	}
};


// --- SAMPLE SELECT BUTTONS ---

Jockey3RM.sampleSelect = function (channel, control, value, status, group) {
	// group = "[Sampler?]"
	if (value > 0x40) {
		var sampler = parseInt(group.substring(8, 9));
		var deckId = (status & 0x07);
		var deckState = this.decks[deckId];
		var currentlySelected = deckState.selectedSamples.indexOf(sampler);

		if (currentlySelected > -1) {
			deckState.selectedSamples.splice(currentlySelected, 1);
		} else {
			deckState.selectedSamples.push(sampler);
		}

		this.updateSampleSelectedLight(deckState, sampler);
	}
}

Jockey3RM.updateSampleSelectedLight = function (deckState, sampler) {
	var selected = deckState.selectedSamples.indexOf(sampler) > -1;
	var offset = (sampler > 4) ? sampler - 4 : sampler;
	midi.sendShortMsg(0x90 + deckState.deckNum - 1, offset + 0x01 - 1, selected ? 0x7f : 00);
}


// LOOP ENCODERS

Jockey3RM.setLoopSize = function (channel, control, value, status, group) {
	var currentSize = engine.getValue(group, "beatloop_size");
	var newValue = value > 0x40 ? currentSize * 2 : currentSize / 2;
	newValue = this.limitMoveLoopSize(newValue);
	engine.setValue(group, "beatloop_size", newValue);
};


Jockey3RM.limitMoveLoopSize = function (size) {
	if (size < Jockey3RM.options.minMoveLoop) return Jockey3RM.options.minMoveLoop;
	if (size > Jockey3RM.options.maxMoveLoop) return Jockey3RM.options.maxMoveLoop;
	return size;
};


Jockey3RM.moveLoop = function (channel, control, value, status, group) {
	var size = engine.getValue(group, "beatjump_size");
	var deckState = this.deckStateFromGroup(group);

	if (deckState.moveLoopPressed) {
		deckState.moveLoopPressed = -1;
		var newValue = this.limitMoveLoopSize(value > 0x40 ? size * 2 : size / 2);
		engine.setValue(group, "beatjump_size", newValue);
	} else {
		// Standard behaviour
		var scale = value - 0x40;
		engine.setValue(group, "loop_move", size * scale);
	}
};

Jockey3RM.moveLoop_depressed = function (channel, control, value, status, group) {
	var deckState = this.deckStateFromGroup(group);

	if (value > 0x40) {
		deckState.moveLoopPressed = 1;
	} else {
		// released
		if (deckState.moveLoopPressed === 1) {
			engine.setValue(group, "reloop_toggle", 1);
		}
		deckState.moveLoopPressed = 0;
	}
};


Jockey3RM.applyToSamplers = function (samplers, fn, avgfn) {
	var len = samplers.length
	var avg = undefined;
	if (len > 0) {
		avg = 0;
		if (avgfn) {
			samplers.forEach(function (s) { avg += avgfn("[Sampler" + s + "]"); });
			avg /= len;
		}

		samplers.forEach(function (s) { fn("[Sampler" + s + "]", avg); });
	}
	return avg;
};

// PITCH SLIDER

Jockey3RM.rateControl = function (channel, control, value, status, group) {
	var newvalue = Jockey3RM.decodeRateValue(control, value);
    var deckState = Jockey3RM.deckStateFromGroup(group);

	if (deckState.sampleDeck && deckState.sampleMode) {
		// Apply rate changes to all samples on that side
		// TODO: do something sensible so that it can be used together with sync
		//\var samplers = deckState.selectedSamples;
		//\samplers.forEach(function (s) { engine.setValue("[Sampler"+s+"]", "rate", newvalue); });
		Jockey3RM.applyToSamplers(deckState.selectedSamples,
			function (s) { engine.setValue(s, "rate", newvalue); });
	} else {
		engine.setValue(group, "rate", newvalue);
	}
};

Jockey3RM.decodeRateValue = function (control, value) {
	value = (value << 7) | control;  // Construct the 14-bit number

	// Range is 0x0000..0x3FFF; center is 0x1FF7 (Center value is wrong to use script.midiPitch)
	if (value <= 0x1ff7) { // Control centre dead zone value
		return script.absoluteLin(value, 1, 0, 0, 0x1ff7);
	} else {
		return script.absoluteLin(value, 0, -1, 0x1ff7, 0x3fff);
	}
}


Jockey3RM.sampleModeSwitch = function (channel, control, value, status, group)  {
	var deckState = this.deckStateFromGroup(group);

	deckState.sampleMode = value > 0x40;
};


Jockey3RM.deckStateFromGroup = function (group) {
	var deckNum = script.deckFromGroup(group);
	return this.decks[deckNum - 1];
};

