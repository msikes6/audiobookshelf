<template>
  <modals-modal v-model="show" name="episode-transcription-modal" :width="900" :height="'unset'">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-2/3 overflow-hidden">
        <p class="text-3xl text-white truncate">Episode Transcription</p>
      </div>
    </template>
    <div class="p-4 w-full text-sm rounded-lg bg-bg shadow-lg border border-black-300 relative overflow-y-auto" style="max-height: 80vh">
      <div class="flex mb-4">
        <div class="w-12 h-12">
          <div class="bg-primary rounded-full flex items-center justify-center" :style="{ height: 48 + 'px', width: 48 + 'px', fontSize: 18 + 'px' }">
            <span class="material-symbols">subtitles</span>
          </div>
        </div>
        <div class="flex-grow px-4">
          <p class="text-lg font-semibold text-gray-200 mb-1">{{ episodeTitle }}</p>
          <p class="text-sm text-gray-400">{{ libraryItemTitle }}</p>
        </div>
      </div>

      <div v-if="!hasTranscription" class="text-center py-8">
        <div class="text-gray-400 mb-4">
          <span class="material-symbols text-6xl">transcribe</span>
        </div>
        <p class="text-gray-400 text-lg mb-4">No transcription available</p>
        <ui-btn v-if="userCanUpdate" @click="generateTranscription" :disabled="processing">
          <span class="material-symbols text-sm mr-1">mic</span>
          Generate Transcription
        </ui-btn>
      </div>

      <div v-else-if="isTranscribing" class="text-center py-8">
        <div class="text-yellow-500 mb-4">
          <span class="material-symbols text-6xl animate-spin">hourglass_empty</span>
        </div>
        <p class="text-yellow-500 text-lg mb-2">Transcription in Progress</p>
        <p class="text-gray-400">This may take several minutes depending on the episode length...</p>
      </div>

      <div v-else-if="transcriptionFailed" class="text-center py-8">
        <div class="text-red-500 mb-4">
          <span class="material-symbols text-6xl">error</span>
        </div>
        <p class="text-red-500 text-lg mb-2">Transcription Failed</p>
        <p class="text-gray-400 mb-4">{{ episode.transcriptionError || 'Unknown error occurred' }}</p>
        <ui-btn v-if="userCanUpdate" @click="generateTranscription" :disabled="processing">
          <span class="material-symbols text-sm mr-1">refresh</span>
          Retry Transcription
        </ui-btn>
      </div>

      <div v-else class="space-y-4">
        <div class="flex items-center justify-between border-b border-gray-600 pb-2">
          <h3 class="text-lg font-semibold text-gray-200">Transcription</h3>
          <div class="flex space-x-2">
            <ui-btn small @click="copyTranscription">
              <span class="material-symbols text-sm mr-1">content_copy</span>
              Copy
            </ui-btn>
            <ui-btn v-if="userCanDelete" small color="error" @click="deleteTranscription" :disabled="processing">
              <span class="material-symbols text-sm mr-1">delete</span>
              Delete
            </ui-btn>
          </div>
        </div>

        <div class="bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto">
          <div class="whitespace-pre-wrap text-gray-200 leading-relaxed" v-html="formattedTranscription"></div>
        </div>

        <div v-if="transcriptionRequestedAt" class="text-xs text-gray-500 text-right">
          Generated: {{ $formatDatetime(transcriptionRequestedAt, dateFormat, timeFormat) }}
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  data() {
    return {
      processing: false
    }
  },
  computed: {
    show: {
      get() {
        return this.$store.state.globals.showEpisodeTranscriptionModal
      },
      set(val) {
        this.$store.commit('globals/setShowEpisodeTranscriptionModal', val)
      }
    },
    episode() {
      return this.$store.state.globals.selectedEpisode || {}
    },
    libraryItem() {
      return this.$store.state.selectedLibraryItem || {}
    },
    libraryItemTitle() {
      return this.libraryItem.media?.metadata?.title || 'Unknown Podcast'
    },
    episodeTitle() {
      return this.episode.title || 'Unknown Episode'
    },
    hasTranscription() {
      return !!this.episode.transcription
    },
    isTranscribing() {
      return this.episode.transcriptionStatus === 'processing'
    },
    transcriptionFailed() {
      return this.episode.transcriptionStatus === 'failed'
    },
    transcriptionRequestedAt() {
      return this.episode.transcriptionRequestedAt
    },
    formattedTranscription() {
      if (!this.episode.transcription) return ''
      // Convert newlines to HTML breaks and escape HTML
      return this.episode.transcription
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
    },
    userCanUpdate() {
      return this.$store.getters['user/getUserCanUpdate']
    },
    userCanDelete() {
      return this.$store.getters['user/getUserCanDelete']
    },
    dateFormat() {
      return this.$store.getters['getServerSetting']('dateFormat')
    },
    timeFormat() {
      return this.$store.getters['getServerSetting']('timeFormat')
    }
  },
  methods: {
    async generateTranscription() {
      if (!this.episode.id || !this.libraryItem.id) return

      this.processing = true
      try {
        await this.$axios.$post(`/api/podcasts/${this.libraryItem.id}/episodes/${this.episode.id}/transcribe`)
        this.$toast.success('Transcription started. This may take several minutes.')
        this.show = false
      } catch (error) {
        console.error('Failed to start transcription:', error)
        const errorMessage = error.response?.data?.error || 'Failed to start transcription'
        this.$toast.error(errorMessage)
      }
      this.processing = false
    },
    async copyTranscription() {
      if (!this.episode.transcription) return

      try {
        await navigator.clipboard.writeText(this.episode.transcription)
        this.$toast.success('Transcription copied to clipboard')
      } catch (error) {
        console.error('Failed to copy to clipboard:', error)
        this.$toast.error('Failed to copy to clipboard')
      }
    },
    async deleteTranscription() {
      const payload = {
        message: `Are you sure you want to delete the transcription for "${this.episodeTitle}"?`,
        callback: (confirmed) => {
          if (confirmed) {
            this.confirmDeleteTranscription()
          }
        },
        type: 'yesNo'
      }
      this.$store.commit('globals/setConfirmPrompt', payload)
    },
    async confirmDeleteTranscription() {
      if (!this.episode.id || !this.libraryItem.id) return

      this.processing = true
      try {
        await this.$axios.$delete(`/api/podcasts/${this.libraryItem.id}/episodes/${this.episode.id}/transcription`)
        this.$toast.success('Transcription deleted')
        this.show = false
      } catch (error) {
        console.error('Failed to delete transcription:', error)
        const errorMessage = error.response?.data?.error || 'Failed to delete transcription'
        this.$toast.error(errorMessage)
      }
      this.processing = false
    }
  }
}
</script>