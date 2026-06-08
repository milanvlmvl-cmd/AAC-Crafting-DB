import React from 'react';

interface LoadingScreenProps {
  progress: number;
  statusText?: string;
  error?: string | null;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  progress,
  statusText = 'Loading ArcheAge Classic Crafting Database...',
  error = null,
}) => {
  const isComplete = progress >= 100;

  return (
    <div className="fixed inset-0 flex flex-col justify-between bg-slate-950 text-slate-100 font-sans z-50 overflow-hidden select-none">
      {/* Background ambient lighting/gradient */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] bg-violet-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" />
      </div>

      {/* Main progress content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl shadow-violet-950/20">
          
          {/* Header & Logo Graphic */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4 animate-bounce">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-200">
              Tell No Tales
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">
              Crafting Calculator
            </p>
          </div>

          {error ? (
            /* Error State UI */
            <div className="space-y-4">
              <div className="flex items-center space-x-3 bg-red-950/50 border border-red-800/60 p-4 rounded-xl text-red-200 text-sm">
                <svg className="w-6 h-6 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-200 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150"
              >
                Retry Load Process
              </button>
            </div>
          ) : (
            /* Standard Loading & Progress UI */
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <span className="text-sm font-medium text-slate-300">
                  {isComplete ? 'Compiling database...' : statusText}
                </span>
                <span className="text-2xl font-bold font-mono text-violet-400">
                  {progress}%
                </span>
              </div>

              {/* Progress Bar Container */}
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-[2px]">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 via-purple-500 to-indigo-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.5)] transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Performance / Loading Stats info */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 font-mono">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase">Engine:</span>
                  WebAssembly SQL
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-slate-500 uppercase">Status:</span>
                  {progress < 100 ? 'Streaming CDN...' : 'Memory Mounted'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mandatory Footer with Developer Branding */}
      <footer className="w-full text-center py-6 border-t border-slate-900 relative z-10">
        <p className="text-xs text-slate-500 font-mono tracking-wide">
          Crafting Calculator developed by Wasbeerotb
        </p>
      </footer>
    </div>
  );
};
