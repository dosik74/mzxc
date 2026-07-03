import React, { useEffect, useState } from 'react'
import PlayerComponent, { Player as PlayerHelper } from './components/Player'
import LoadingSpinner from './components/LoadingSpinner'

type Track = {
  id: string
  title: string
  artist: string
  thumbnail?: string
  duration?: number
  url?: string
  query?: string
  spotifyUrl?: string
  lastfmUrl?: string
}

type PageKey = 'home' | 'search' | 'recommendations' | 'tracks' | 'track'

type Locale = 'ru' | 'en'

const dictionary = {
  ru: {
    appTitle: 'FOR YOU',
    subtitle: 'Last.fm метаданные и YouTube стрим',
    home: 'Главная',
    search: 'Поиск',
    recommendations: 'Рекомендации',
    allTracks: 'Все треки',
    spotifyPicks: 'Топ Last.fm',
    discover: 'Открой звук, который подходит твоему настроению.',
    homeDescription: 'Ищи треки по метаданным Last.fm и запускай поток из YouTube.',
    searchTracks: 'Поиск треков',
    searchDescription: 'Находи композиции через Last.fm и слушай их с YouTube.',
    searchPlaceholder: 'Искать исполнителя, песню или альбом',
    searchButton: 'Поиск',
    recommendationsTitle: 'Рекомендации Last.fm',
    recommendationsDescription: 'Свежие треки на основе популярных треков Last.fm.',
    refresh: 'Обновить',
    featuredRecommendations: 'Популярные подборки',
    whyItWorks: 'Почему это работает',
    whyItWorksDescription: 'Last.fm дает точные названия и артисты, а YouTube обеспечивает поток.',
    bullet1: '• Метаданные Last.fm для треков',
    bullet2: '• Красивые обложки для каждой песни',
    bullet3: '• Топ-рекомендации с Last.fm',
    bullet4: '• Быстрый поиск и плавное воспроизведение',
    allTracksTitle: 'Все треки',
    allTracksDescription: 'Список всех треков из поиска и рекомендаций Last.fm.',
    recommendedTag: 'Рекомендовано',
    noTracksMessage: 'Пока нет треков для отображения.',
    liked: 'Last.fm',
    unknownLength: 'Неизвестно',
    loading: 'Загрузка…',
    selectTrack: 'Выберите трек, чтобы начать',
    tapCard: 'Нажмите на карточку, чтобы воспроизвести'
  },
  en: {
    appTitle: 'FOR YOU',
    subtitle: 'Last.fm metadata with YouTube streaming.',
    home: 'Home',
    search: 'Search',
    recommendations: 'Recommendations',
    allTracks: 'All Tracks',
    spotifyPicks: 'Last.fm Tracks',
    discover: 'Discover the sound that fits your mood.',
    homeDescription: 'Use Last.fm metadata for titles and artwork, then stream audio from YouTube.',
    searchTracks: 'Search Tracks',
    searchDescription: 'Find songs using Last.fm and play the best matching audio.',
    searchPlaceholder: 'Search artist, song, or album',
    searchButton: 'Search',
    recommendationsTitle: 'Last.fm Recommendations',
    recommendationsDescription: 'Fresh tracks from Last.fm metadata with YouTube streaming.',
    refresh: 'Refresh',
    featuredRecommendations: 'Featured recommendations',
    whyItWorks: 'Why it works',
    whyItWorksDescription: 'Last.fm metadata gives accurate titles and artists, while the player uses YouTube audio streams.',
    bullet1: '• Accurate titles and artists from Last.fm',
    bullet2: '• Beautiful cover artwork for each song',
    bullet3: '• Top-chart recommendations from Last.fm',
    bullet4: '• Fast search and responsive playback',
    allTracksTitle: 'All Tracks',
    allTracksDescription: 'Browse all tracks from search and recommendations.',
    recommendedTag: 'Recommended',
    noTracksMessage: 'No tracks available yet.',
    liked: 'Last.fm',
    unknownLength: 'Unknown length',
    loading: 'Loading…',
    selectTrack: 'Choose a track to start',
    tapCard: 'Tap any card to begin listening'
  }
}

export default function App() {
  const [page, setPage] = useState<PageKey>('search')
  const [lang, setLang] = useState<Locale>('ru')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') return stored
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch (e) {
      return 'dark'
    }
  })
  const [searchQuery, setSearchQuery] = useState('tame')
  const [searchResults, setSearchResults] = useState<Track[]>([])
  const [lastfmMatches, setLastfmMatches] = useState<Track[]>([])
  const [recommendations, setRecommendations] = useState<Track[]>([])
  const [featured, setFeatured] = useState<Track[]>([])
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [loading, setLoading] = useState(false)
  const locale = dictionary[lang]

  async function search(q = searchQuery, markAsLastfm = false) {
    if (!q) return
    setLoading(true)
    try {
      const url = new URL('/api/search', window.location.origin)
      url.searchParams.set('q', q)
      if (markAsLastfm) {
        url.searchParams.set('lastfm', 'true')
      }
      const res = await fetch(url.toString())
      if (!res.ok) {
        const text = await res.text()
        console.error('Search failed:', res.status, text)
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        console.error('Search returned non-JSON response:', contentType, text)
        return
      }
      const data = await res.json()
      if (markAsLastfm) {
        setLastfmMatches(data)
      } else {
        setSearchResults(data)
        // clear any previous lastfm-only matches when doing a fresh user search
        setLastfmMatches([])
      }
      setPage('search')
    } catch (err) {
      console.error('Search parse error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadRecommendations() {
    try {
      const res = await fetch('/api/recommendations')
      if (!res.ok) {
        const text = await res.text()
        console.error('Recommendations failed:', res.status, text)
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        console.error('Recommendations returned non-JSON response:', contentType, text)
        return
      }
      const data = await res.json()
      setRecommendations(data)
      setFeatured(data.slice(0, 6))
    } catch (err) {
      console.error('Recommendations parse error:', err)
    }
  }

  function openTrack(track: Track) {
    setSelectedTrack(track)
    setPage('track')
  }

  useEffect(() => {
    void loadRecommendations()
    void search(searchQuery)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme)
    } catch (e) {}
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('theme-dark', theme === 'dark')
      document.documentElement.classList.toggle('theme-light', theme === 'light')
    }
  }, [theme])

  const pages = [
    { key: 'home' as PageKey, label: locale.home },
    { key: 'search' as PageKey, label: locale.search },
    { key: 'recommendations' as PageKey, label: locale.recommendations },
    { key: 'tracks' as PageKey, label: locale.allTracks }
  ]

  const allTracks = Array.from(
    new Map([...recommendations, ...searchResults].map((track) => [track.id, track])).values()
  )

  return (
    <div className="min-h-screen bg-background text-on-background pb-32">
      <header className="w-full top-0 sticky z-40 bg-background border-b border-slate-200/60 py-4">
        <div className="max-w-6xl mx-auto px-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-3xl">headphones</span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">{locale.appTitle}</h1>
              <p className="text-sm text-slate-600">{locale.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex flex-wrap gap-2">
              {pages.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setPage(item.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${page === item.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setLang('ru')}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${lang === 'ru' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}
              >RU</button>
              <button
                onClick={() => setLang('en')}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${lang === 'en' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}
              >EN</button>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
                className="ml-2 rounded-full p-2 bg-slate-100 hover:bg-slate-200 text-sm font-semibold flex items-center justify-center"
              >
                {theme === 'dark' ? '☀' : '🌙'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-8">
        {page === 'home' && (
          <section className="space-y-6">
            <div className="rounded-[28px] bg-slate-950 text-white p-8 shadow-xl overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-transparent to-slate-900/80" />
              <div className="relative grid gap-6 md:grid-cols-[1.4fr_0.8fr] items-center">
                <div>
                  <div className="text-sm uppercase tracking-[0.32em] text-cyan-300/80 font-semibold mb-4">{locale.spotifyPicks}</div>
                  <h2 className="text-4xl font-black tracking-tight">{locale.discover}</h2>
                  <p className="mt-4 max-w-2xl text-slate-300">{locale.homeDescription}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => setPage('search')} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg hover:bg-slate-100 transition">{locale.search}</button>
                    <button onClick={() => setPage('recommendations')} className="rounded-full border border-white/20 px-5 py-3 text-sm text-white hover:bg-white/10 transition">{locale.recommendations}</button>
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 p-5 bg-white/5 backdrop-blur-lg">
                  <div className="grid grid-cols-3 gap-3">
                    {featured.map((track) => (
                      <div key={track.id} className="aspect-square rounded-3xl overflow-hidden bg-slate-800">
                        <img src={track.thumbnail || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`} alt={track.title} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                <h3 className="text-xl font-semibold mb-3">{locale.featuredRecommendations}</h3>
                <div className="grid gap-3">
                  {recommendations.slice(0, 4).map((track) => (
                    <button key={track.id} onClick={() => PlayerHelper.playTrackExtern(track)} className="flex items-center gap-4 rounded-3xl border border-slate-200 p-4 text-left hover:bg-slate-50 transition">
                      <img src={track.thumbnail || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`} alt={track.title} className="h-16 w-16 rounded-2xl object-cover" />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{track.title}</div>
                        <div className="text-sm text-slate-500 truncate">{track.artist}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl bg-slate-950 text-white p-6 shadow-xl">
                <h3 className="text-xl font-semibold mb-3">{locale.whyItWorks}</h3>
                <p className="text-slate-300">{locale.whyItWorksDescription}</p>
                <ul className="mt-4 space-y-3 text-slate-300">
                  <li>{locale.bullet1}</li>
                  <li>{locale.bullet2}</li>
                  <li>{locale.bullet3}</li>
                  <li>{locale.bullet4}</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {page === 'search' && (
          <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">{locale.searchTracks}</h2>
                <p className="mt-2 text-sm text-slate-600">{locale.searchDescription}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={locale.searchPlaceholder}
                  className="w-full min-w-[240px] rounded-full border border-slate-300 px-5 py-3 shadow-sm focus:border-slate-500 focus:outline-none"
                />
                <button onClick={() => void search(searchQuery)} className="rounded-full bg-slate-950 px-5 py-3 text-white shadow-sm hover:bg-slate-800 transition">
                  {loading ? <LoadingSpinner className="inline-block align-middle" small /> : locale.searchButton}
                </button>
              </div>
            </div>

            {lastfmMatches.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-3">Matches from Last.fm</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {lastfmMatches.map((track) => (
                    <button key={track.id} onClick={() => PlayerHelper.playTrackExtern(track)} className="group rounded-3xl overflow-hidden border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md relative">
                      <div className="absolute top-3 right-3 z-20">
                        <span
                          role="button"
                          tabIndex={0}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); void search(track.searchQuery, true); }}
                          className="rounded-full bg-slate-100/90 px-3 py-1 text-xs text-slate-900 cursor-pointer"
                        >Find</span>
                      </div>
                      <div className="relative h-56 overflow-hidden bg-slate-100">
                        <img src={track.thumbnail || `/fallback-poster.svg`} alt={track.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      </div>
                      <div className="p-4">
                        <div className="font-semibold truncate">{track.title}</div>
                        <div className="mt-1 text-sm text-slate-500 truncate">{track.artist}</div>
                        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                          <span>{track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : locale.unknownLength}</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1">{locale.liked}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {searchResults.map((track) => (
                <button key={track.id} onClick={() => PlayerHelper.playTrackExtern(track)} className="group rounded-3xl overflow-hidden border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md relative">
                  <div className="absolute top-3 right-3 z-20">
                    <span
                      role="button"
                      tabIndex={0}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); void search(track.searchQuery, true); }}
                      className="rounded-full bg-slate-100/90 px-3 py-1 text-xs text-slate-900 cursor-pointer"
                    >Find</span>
                  </div>
                  <div className="relative h-56 overflow-hidden bg-slate-100">
                    <img src={track.thumbnail || `/fallback-poster.svg`} alt={track.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  </div>
                  <div className="p-4">
                    <div className="font-semibold truncate">{track.title}</div>
                    <div className="mt-1 text-sm text-slate-500 truncate">{track.artist}</div>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                      <span>{track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : locale.unknownLength}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">{locale.liked}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {page === 'recommendations' && (
          <section className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">{locale.recommendationsTitle}</h2>
                <p className="mt-2 text-sm text-slate-600">{locale.recommendationsDescription}</p>
              </div>
              <button onClick={() => void loadRecommendations()} className="rounded-full border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-100 transition">{locale.refresh}</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recommendations.map((track) => (
                <button key={track.id} onClick={() => PlayerHelper.playTrackExtern(track)} className="flex flex-col rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm text-left hover:-translate-y-1 hover:shadow-md transition relative">
                  <div className="absolute top-3 right-3 z-20">
                    <span
                      role="button"
                      tabIndex={0}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); void search(track.searchQuery, true); }}
                      className="rounded-full bg-slate-100/90 px-3 py-1 text-xs text-slate-900 cursor-pointer"
                    >Find</span>
                  </div>
                  <div className="h-56 overflow-hidden bg-slate-100">
                    <img src={track.thumbnail || `/fallback-poster.svg`} alt={track.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-4">
                    <div className="font-semibold truncate">{track.title}</div>
                    <div className="mt-1 text-sm text-slate-500 truncate">{track.artist}</div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>{track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : locale.unknownLength}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">{locale.recommendedTag}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {page === 'tracks' && (
          <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">{locale.allTracksTitle}</h2>
                <p className="mt-2 text-sm text-slate-600">{locale.allTracksDescription}</p>
              </div>
            </div>

            {allTracks.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">{locale.noTracksMessage}</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {allTracks.map((track) => (
                  <button key={track.id} onClick={() => PlayerHelper.playTrackExtern(track)} className="group rounded-3xl overflow-hidden border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                    <div className="relative h-56 overflow-hidden bg-slate-100">
                      <img src={track.thumbnail || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`} alt={track.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    </div>
                    <div className="p-4">
                      <div className="font-semibold truncate">{track.title}</div>
                      <div className="mt-1 text-sm text-slate-500 truncate">{track.artist}</div>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                        <span>{track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : locale.unknownLength}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1">{locale.liked}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        {page === 'track' && selectedTrack && (
          <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.32em] text-cyan-600 font-semibold mb-2">Track page</div>
                <h2 className="text-3xl font-semibold">{selectedTrack.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{selectedTrack.artist}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setPage('recommendations')} className="rounded-full border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-100 transition">{locale.recommendations}</button>
                <button onClick={() => setPage('search')} className="rounded-full border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-100 transition">{locale.search}</button>
                <button onClick={() => { if (selectedTrack?.searchQuery) void search(selectedTrack.searchQuery, true) }} className="rounded-full border border-slate-300 px-5 py-3 text-slate-700 hover:bg-slate-100 transition">Find on Last.fm</button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                <img src={selectedTrack.thumbnail || `https://i.ytimg.com/vi/${selectedTrack.id}/hqdefault.jpg`} alt={selectedTrack.title} className="h-80 w-full object-cover" />
                <div className="p-6">
                  <div className="text-sm text-slate-500 uppercase tracking-[0.2em] mb-3">Now playing</div>
                  <h3 className="text-2xl font-semibold mb-2">{selectedTrack.title}</h3>
                  <p className="text-slate-600 mb-4">{selectedTrack.artist}</p>
                  <div className="space-y-3 text-slate-700">
                    <div><span className="font-semibold">Duration:</span> {selectedTrack.duration ? `${Math.floor(selectedTrack.duration / 60)}:${String(selectedTrack.duration % 60).padStart(2, '0')}` : locale.unknownLength}</div>
                    <div><span className="font-semibold">Source:</span> Last.fm metadata + YouTube stream</div>
                    {selectedTrack.lastfmUrl ? (
                      <div>
                        <a href={selectedTrack.lastfmUrl} target="_blank" rel="noreferrer" className="text-cyan-600 hover:underline">Open track page on Last.fm</a>
                      </div>
                    ) : null}
                  </div>
                  <button onClick={() => PlayerHelper.playTrackExtern(selectedTrack)} className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-white font-semibold hover:bg-slate-800 transition">Play track</button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-xl font-semibold mb-4">Metadata</h3>
                <div className="grid gap-4">
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">Title</div>
                    <div className="font-medium">{selectedTrack.title}</div>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">Artist</div>
                    <div className="font-medium">{selectedTrack.artist}</div>
                  </div>
                  {selectedTrack.searchQuery ? (
                    <div className="rounded-3xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Search query</div>
                      <div className="font-medium break-words">{selectedTrack.searchQuery}</div>
                    </div>
                  ) : null}
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">Stream URL</div>
                    <div className="font-medium break-words">{selectedTrack.url}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <PlayerComponent />
    </div>
  )
}
