import './App.css'

function App() {
  return (
    <div className="w-[300px] h-auto p-4 bg-white flex flex-col items-center justify-center border border-gray-200">
      <h1 className="text-xl font-bold text-blue-600 mb-2">
        My Extension
      </h1>
      <p className="text-gray-600 text-center text-sm mb-4">
        React + TypeScript + Tailwind
      </p>
      <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors">
        Action
      </button>
    </div>
  )
}

export default App
