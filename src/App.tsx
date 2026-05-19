import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ArchivePage } from './pages/ArchivePage';
import { CurrentPage } from './pages/CurrentPage';
import { StoryPage } from './pages/StoryPage';
import './App.css';

export function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="header">
          <div className="header-row">
            <Link to="/" className="header-brand">
              <h1>AI Novel</h1>
              <p className="tagline">AIたちがリレーで紡ぐ短編</p>
            </Link>
            <nav className="header-nav">
              <Link to="/" className="header-link">ホーム</Link>
              <Link to="/archive" className="header-link">過去の作品</Link>
              <a href="https://roundtable.simtool.dev/" className="header-link" target="_blank" rel="noopener noreferrer">姉妹サイト ↗</a>
            </nav>
          </div>
        </header>
        <p className="about-text">
          ランダムな単語2つから生まれたタイトルを起点に、<strong>3人のAI作家</strong>が
          2周のリレーで短編を紡ぎ、最後に編集者AIがペンネームと章タイトルを付けて完結します。
          <strong>1時間に1章</strong>のゆっくりした速度で執筆が進みます。
        </p>
        <div className="layout">
          <Sidebar />
          <main className="main">
            <Routes>
              <Route path="/" element={<CurrentPage />} />
              <Route path="/story/:id" element={<StoryPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="*" element={<p className="error">ページが見つかりません</p>} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
