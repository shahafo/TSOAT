/** Vite cannot bundle h264-mp4-encoder's Node wasm build. Export uses WebCodecs. */
export default {
  createH264MP4Encoder(): Promise<never> {
    return Promise.reject(
      new Error(
        "Video export requires WebCodecs, which this browser does not support. Try Chrome or Edge."
      )
    )
  },
}
