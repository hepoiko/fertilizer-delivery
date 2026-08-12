<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../stores/useSettingsStore'

const { settings, effectiveApiKey, setApiKey, setStartingPoint } = useSettingsStore()

const keyInput = ref(settings.apiKey)
const startInput = ref(settings.startingPoint)
const saved = ref(false)

function save(): void {
  setApiKey(keyInput.value)
  setStartingPoint(startInput.value)
  saved.value = true
  setTimeout(() => (saved.value = false), 2500)
}
</script>

<template>
  <div class="setup">
    <div class="card">
      <h2>Connect Google Maps</h2>
      <p class="muted">
        This app runs entirely in your browser — no data leaves your machine except geocoding
        requests to Google Maps. To plot delivery locations we need an API key.
      </p>

      <ol class="steps">
        <li>
          Go to the
          <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noreferrer">
            Google Maps Platform
          </a>
          and create a project (billing must be enabled).
        </li>
        <li>Enable the <strong>Maps JavaScript API</strong>.</li>
        <li>Create an API key under <em>Credentials</em>.</li>
        <li>
          For security, restrict the key to your domain, e.g. <code>localhost:5173</code> while
          developing.
        </li>
      </ol>

      <label for="api-key">Google Maps API key</label>
      <input
        id="api-key"
        v-model="keyInput"
        type="password"
        placeholder="AIza..."
        autocomplete="off"
        spellcheck="false"
      />

      <label for="start-point">Starting point (depot) — optional, used for distances</label>
      <input
        id="start-point"
        v-model="startInput"
        type="text"
        placeholder="e.g. 123 Depot Street, Springfield, IL"
      />

      <div class="row">
        <button class="btn primary" @click="save">Save &amp; connect</button>
        <span v-if="saved" class="success">✓ Saved to this browser</span>
      </div>

      <p v-if="effectiveApiKey" class="muted" style="margin-top: 14px">
        A key is configured. You can change it here anytime.
      </p>
    </div>
  </div>
</template>
