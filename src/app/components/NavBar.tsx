import { usePathname } from 'next/navigation';
import { useContext } from 'react';
import { AuthContext } from '../lib/contexts';


export default function NavBar() {
  const userVal = useContext(AuthContext);
  const pathname = usePathname();

  if (!userVal) {
    return null;
  }

  const { logoutUser, username } = userVal;

  return (
    <header className="flex items-center justify-between mb-8">
      <div className="flex items-center">
        <img 
          src="images/v-logo.png"
          alt="Logo"
          className="w-16 h-12"/>
        <div className="text-3xl font-bold text-white ml-4">VandyClassConnect</div>
      </div>
      <div className="flex space-x-4">
        <a href="/home" className="text-white hover:text-gray-300">Home</a>
        <a href="/about" className="text-white hover:text-gray-300">About</a>
        
        {/* Wrap multiple elements inside a fragment or a container */}
        {username && (
          <>
            <a href="savedCourses" className="text-white hover:text-gray-300">Saved Courses</a>
            <a href="/profile" className="text-white hover:text-gray-300">Profile</a>
          </>
        )}
        
        {pathname !== '/login' && pathname !== '/register' && (
          <a href="#" className="text-white hover:text-gray-300" onClick={() => { logoutUser() }}>
            Log Out
          </a>
        )}
      </div>
    </header>
  );
}