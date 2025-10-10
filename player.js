class AudioPlaylistPlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.currentTrackIndex = 0;
    this.playlist = [];

    // Web Audio API properties
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this.animationFrameId = null;
  }

  connectedCallback() {
    const playlistAttr = this.getAttribute("playlist");
    const playPauseBtn = document.getElementById("play-pause-btn");

    try {
      this.playlist = JSON.parse(playlistAttr || "[]");
    } catch (e) {
      console.error("Failed to parse playlist attribute:", e);
      this.playlist = [];
    }

    if (this.playlist.length === 0) {
      this.shadowRoot.innerHTML = "<p>No playlist URLs provided.</p>";
      return;
    }

    this.render();

    this.audioPlayer = this.shadowRoot.querySelector("#audio-player");
    this.playlistList = this.shadowRoot.querySelector("#playlist-list");
    this.seekSlider = this.shadowRoot.querySelector("#seek-slider");

    this.currentTrackInfo = this.shadowRoot.querySelector(
      "#current-track-info",
    );
    this.volumeSlider = this.shadowRoot.querySelector("#volume-slider"); 
    this.playPauseBtn = this.shadowRoot.querySelector("#play-pause-btn");
    this.canvas = this.shadowRoot.querySelector("#visualizer-canvas");
    this.canvasCtx = this.canvas.getContext("2d");

    // Event listeners
    this.audioPlayer.addEventListener("ended", this.playNext.bind(this));
    this.audioPlayer.addEventListener("pause", () => this.stopVisualizer());
    
    // The visualizer is started when the 'playing' event fires
    this.audioPlayer.addEventListener("playing", () => this.startVisualizer());
    
    this.audioPlayer.addEventListener('timeupdate', () => {
      this.seekSlider.value = this.audioPlayer.currentTime;
    });

    this.audioPlayer.onloadedmetadata = () => {
        this.seekSlider.max = this.audioPlayer.duration;
    };


    this.seekSlider.onchange = () => {
        this.audioPlayer.currentTime = this.seekSlider.value;
    };

    this.volumeSlider.onchange = () => {
        this.audioPlayer.volume = this.volumeSlider.value;
    }

    this.playPauseBtn.addEventListener("click", () => {
      if (this.audioPlayer.paused) {
        this.audioPlayer.play();
        this.playPauseBtn.textContent = "Pause";
      } else {
        this.audioPlayer.pause();
        this.playPauseBtn.textContent = "Play";
      }
    });

    this.buildPlaylistUI();
    this.loadTrack(0);
  }

  disconnectedCallback() {
    this.stopVisualizer();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      // Create media source and connect to analyser
      this.source = this.audioContext.createMediaElementSource(
        this.audioPlayer,
      );
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }
  }

  // Defines the HTML structure and CSS
  render() {
    this.shadowRoot.innerHTML = `
        <style>
            @import url("player.css");
        </style>
        <div class="player-container">
          <div id="custom-audio-player">
            <h1 class="neon-text">🎶 My Tunes 🎶</h1>
            <canvas id="visualizer-canvas" width="400" height="80"></canvas>
            <span class="text-left">Seek</span> <input type="range" id="seek-slider" class="neon-text" min="0" value="0">
            <audio id="audio-player" preload="auto" crossOrigin="anonymous"></audio>
            <span class="text-left">Volume</span> <input id="volume-slider" type="range" class="neon-text" min="0" max="1" step="0.01" value="1">
            <button id="play-pause-btn">Pause</button>
            <div id="current-track-info">Ready to play...</div>
            <ul id="playlist-list"></ul>
          </div>
        </div>
    `;
  }

  draw() {
    this.animationFrameId = requestAnimationFrame(this.draw.bind(this));

    this.analyser.getByteFrequencyData(this.dataArray);

    const WIDTH = this.canvas.width;
    const HEIGHT = this.canvas.height;
    const bufferLength = this.dataArray.length;

    this.canvasCtx.fillStyle = "#007bff";
    this.canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    let barWidth = (WIDTH / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      barHeight = (this.dataArray[i] / 255) * HEIGHT;

      const r = barHeight + 10 * (i / bufferLength);
      const g = 100 * (i / bufferLength);
      const b = 20;

      this.canvasCtx.fillStyle = `rgb(${r},${g},${b})`;
      this.canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }
  }

  startVisualizer() {
    this.initAudioContext();
    // Browsers often suspend the AudioContext until the user interacts.
    if (this.audioContext.state === "suspended") {
      this.audioContext
        .resume()
        .catch((e) => console.error("AudioContext resume failed:", e));
    }

    if (!this.animationFrameId) {
      this.draw();
    }
    this.updateTrackInfo();
  }

  stopVisualizer() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.updateTrackInfo();
  }

  getTrackName(url) {
    const parts = url.split("/");
    let name = parts[parts.length - 1];
    name = name.substring(0, name.lastIndexOf("."));
    return name.replace(/_/g, " ").replace(/-/g, "/");
  }

  loadTrack(index) {
    if (index < 0 || index >= this.playlist.length) {
      this.stopVisualizer();
      this.currentTrackInfo.textContent = "Playlist Finished.";
      return;
    }

    this.currentTrackIndex = index;
    const url = this.playlist[this.currentTrackIndex];

    this.audioPlayer.src = url;
    // Note: Playing may still fail if the browser requires user interaction first.
    this.audioPlayer.play().catch((error) => {
      console.warn(
        "Playback blocked by browser (user interaction required):",
        error.message,
      );
      this.stopVisualizer();
    });

    this.updatePlaylistActiveState();
    this.updateTrackInfo();
  }

  playNext() {
    this.loadTrack(this.currentTrackIndex + 1);
  }

  updateTrackInfo() {
    const trackName = this.getTrackName(this.playlist[this.currentTrackIndex]);
    let status = "Ready to play";

    if (this.audioPlayer.paused && this.audioPlayer.currentTime > 0) {
      status = "Paused";
    } else if (this.audioPlayer.paused) {
      status = "Stopped";
    } else if (this.audioPlayer.seeking || this.audioPlayer.waiting) {
      status = "Loading";
    } else {
      status = "Now Playing";
    }

    this.currentTrackInfo.textContent = `${status}: ${trackName.substring(0, 14)}`;
  }

  updatePlaylistActiveState() {
    this.shadowRoot
      .querySelectorAll("#playlist-list li")
      .forEach((item, idx) => {
        item.classList.toggle("active", idx === this.currentTrackIndex);
      });
  }

  buildPlaylistUI() {
    this.playlistList.innerHTML = "";
    this.playlist.forEach((url, index) => {
      const listItem = document.createElement("li");
      listItem.textContent = this.getTrackName(url);
      listItem.addEventListener("click", () => {
        this.loadTrack(index);
      });
      this.playlistList.appendChild(listItem);
    });
  }
}

customElements.define("audio-playlist-player", AudioPlaylistPlayer);
