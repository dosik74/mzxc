import React, { useEffect, useRef, useState } from 'react'

type Track = {
  id: string
  title: string
  artist: string
  thumbnail?: string
  duration?: number
  url: string
}

// Singleton helper so App can trigger playback
const PlayerSingleton: any = {
  playTrackExtern: (track: Track) => {}
}

export default function Player() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [track, setTrack] = useState<Track | null>(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.85)

  useEffect(() => {
    PlayerSingleton.playTrackExtern = (t: Track) => {
      void playTrack(t)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const onLoaded = () => setDuration(audio.duration || 0)
    const onEnded = () => setPlaying(false)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audioRef.current])

  async function playTrack(t: Track) {
    if (track?.id === t.id) {
      if (playing) {
        audioRef.current?.pause()
      } else {
        await audioRef.current?.play()
      }
      return
    }

    setLoading(true)
    setTrack(t)
    setCurrentTime(0)
    setDuration(0)

    try {
      const res = await fetch(`/api/stream?url=${encodeURIComponent(t.url)}`)
      const data = await res.json()
      if (!audioRef.current) return
      audioRef.current.src = data.audioUrl
      audioRef.current.volume = volume
      await audioRef.current.play()
      setPlaying(true)
    } catch (error) {
      console.error(error)
      alert('Ошибка воспроизведения')
    } finally {
      setLoading(false)
    }
  }

  function togglePlay() {
    if (!audioRef.current) return
    if (playing) audioRef.current.pause()
    else audioRef.current.play()
  }

  function seekTo(perc: number) {
    if (!audioRef.current || !duration) return
    audioRef.current.currentTime = perc * duration
    setCurrentTime(audioRef.current.currentTime)
  }

  function formatTime(seconds: number) {
    if (!isFinite(seconds)) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0')
    return `${minutes}:${secs}`
  }

  const progressWidth = duration ? `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` : '0%'

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <div className="w-full max-w-3xl bg-black/95 border border-white/10 rounded-[28px] overflow-hidden shadow-[0_30px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="w-full h-1 bg-white/10 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-cyan-400 w-[35%] transition-all duration-500 ease-linear" style={{ width: progressWidth }} />
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden flex-shrink-0">
              <img
                src={track?.thumbnail || 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'}
                alt={track?.title || 'album cover'}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] uppercase tracking-[0.24em] text-white/60 font-semibold mb-1">Now playing</div>
              <div className="text-white text-sm md:text-base font-semibold truncate">{track?.title || 'Выберите трек для начала'}</div>
              <div className="text-white/60 text-xs md:text-sm truncate">{track?.artist || 'Нажмите на карточку в списке'}</div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-3 md:gap-4">
              <button className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white transition hover:bg-white/10 active:scale-[0.97]">
                <span className="material-symbols-outlined">skip_previous</span>
              </button>
              <button
                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center transition hover:scale-[1.02] active:scale-[0.97]"
                onClick={togglePlay}
              >
                <span className="material-symbols-outlined text-[28px]">{playing ? 'pause' : 'play_arrow'}</span>
              </button>
              <button className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white transition hover:bg-white/10 active:scale-[0.97]">
                <span className="material-symbols-outlined">skip_next</span>
              </button>
            </div>
            <div
              className="w-full cursor-pointer"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const x = (e as React.MouseEvent<HTMLDivElement>).clientX - rect.left
                const percent = x / rect.width
                seekTo(Math.max(0, Math.min(1, percent)))
              }}
            >
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-cyan-400 transition-all duration-200" style={{ width: progressWidth }} />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-white/60">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3 min-w-[110px]">
            <div className="flex items-center gap-2">
              <button className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white transition hover:bg-white/10 active:scale-[0.97]">
                <span className="material-symbols-outlined">favorite</span>
              </button>
              <button className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white transition hover:bg-white/10 active:scale-[0.97] hidden md:flex">
                <span className="material-symbols-outlined">keyboard_arrow_up</span>
              </button>
            </div>
            <div className="flex items-center gap-2 w-full">
              <span className="text-white/70 text-sm">🔊</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setVolume(next)
                  if (audioRef.current) audioRef.current.volume = next
                }}
                className="h-1 w-full accent-cyan-400 bg-white/10 rounded-full"
              />
            </div>
            {loading && <div className="text-[12px] text-white/70">Загрузка...</div>}
          </div>
        </div>
      </div>

      <audio ref={audioRef} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    </div>
  )
}

export { PlayerSingleton as Player }
