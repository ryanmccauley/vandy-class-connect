'use client';
import { Tooltip } from "@mui/material";
import localforage from 'localforage';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RecordModel } from 'pocketbase';
import { Suspense, useEffect, useState } from 'react';
import { FaBookmark, FaChalkboardTeacher, FaFileDownload, FaFlag, FaRegBookmark, FaUsers } from 'react-icons/fa';
import { IoClose } from "react-icons/io5";
import Loading from "../components/Loading";
import RatingBox from '../components/ratingBox';
import StarRating from '../components/StarRating';
import { useAuth } from "../lib/contexts";
import pb from "../lib/pocketbaseClient";

pb.autoCancellation(false);

interface CachedData {
  savedCourses: { id: string }[];
  cachedAt: number;
}

interface Professor {
  id: string;
  firstName: string;
  lastName: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  syllabus?: string;
  anonymous?: boolean;
  expand?: {
    user?: User;
    professors?: Professor[];
  };
}

interface CourseData {
  id: string;
  code: string;
  name: string;
  expand?: {
    reviews?: Review[];
    professors?: Professor[];
  };
  tutors?: string[];
  syllabus?: string;
  averageRating?: number;
  cachedAt?: number;
}

interface User extends RecordModel {
  username: string;
  email: string;
  verified: boolean;
  emailVisibility: boolean;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  courses_tutored?: string[];
  expand?: {
    courses_tutored?: CourseData[];
  };
}

interface CacheEntry {
  data: User;
  timestamp: number;
}


function CourseDetailPageComponent() {

  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const { userData } = useAuth(); // Getting the current user
  const [course, setCourse] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [averageRating, setAverageRating] = useState(0);
  const [tutorDetails, setTutorDetails] = useState([]);
  const [showTutors, setShowTutors] = useState(false);
  const [isTutor, setIsTutor] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [professors, setProfessors] = useState([]);
  const [selectedProfessor, setSelectedProfessor] = useState("");
  const [copiedEmailMessage, setCopiedEmailMessage] = useState('');
  const [selectedRating, setSelectedRating] = useState(0);
  const [hasSyllabus, setHasSyllabus] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const currentUserId = userData?.id;

  useEffect(() => {
    if (!code) return;
    const fetchCourse = async () => {
      const cacheExpiry = 5 * 60 * 1000; // 5 minutes in milliseconds
      const now = Date.now();
      let foundCourse = null;

      try {
        foundCourse = await localforage.getItem(`course_${code}`);
        if (foundCourse && now - foundCourse.cachedAt < cacheExpiry) {
          initializeState(foundCourse);
          // Use the cached course data
          setCourse(foundCourse);
          setLoading(false);
          return;
        }
        const fetchedCourse = await pb.collection('courses').getFirstListItem(
          `code = "${code}"`, // Use a filter to match the course code
          {
            expand: 'reviews.user,reviews.professors,professors', // Expand relationships as needed
          }
        );
        if (fetchedCourse.syllabus) {
          fetchedCourse.syllabus = pb.files.getUrl(fetchedCourse, fetchedCourse.syllabus);
        }
        fetchedCourse.cachedAt = now;
        await localforage.setItem(`course_${code}`, fetchedCourse);
        initializeState(fetchedCourse);
      } catch (error) {
        console.error('Error fetching course:', error);
      } finally {
        setLoading(false);
      }
    };
    const initializeState = async (courseData) => {
      setCourse(courseData);
      setReviews(courseData.expand?.reviews || []);
      setProfessors(courseData.expand?.professors || []);

      const totalRating = courseData.expand?.reviews.reduce(
        (sum, review) => sum + (review.rating || 0),
        0
      );
      const avgRating = courseData.expand?.reviews.length
        ? totalRating / courseData.expand?.reviews.length
        : courseData.averageRating || 0;
      setAverageRating(avgRating);

      const fetchedTutors = courseData.tutors || [];
      const currentTutor = currentUserId ? fetchedTutors.includes(currentUserId) : false;
      setIsTutor(currentTutor);

      // Fetch tutor user details
      const fetchedTutorDetails = await fetchTutorDetails(fetchedTutors);
      setTutorDetails(fetchedTutorDetails);
    };

    fetchCourse();
  }, [code, currentUserId]);


  const fetchTutorDetails = async (tutors) => {
    if (!tutors.length) return [];
    const tutorPromises = tutors.map(async (userId) => {
      try {
        return await pb.collection('users').getOne(userId);
      } catch (error) {
        console.error('Error fetching tutor details:', error);
        return null;
      }
    });
    return (await Promise.all(tutorPromises)).filter(Boolean);
  };

  const toggleSaveCourse = async (courseId) => {
    if (!currentUserId) {
      setPopupMessage('You must be logged in to save this course.');
      return;
    }

    try {
      // Fetch the user's current saved courses from PocketBase
      const userRecord = await pb.collection('users').getOne(currentUserId, { autoCancellation: false });

      let updatedSavedCourses;

      if (isSaved) {
        // Remove the course from savedCourses
        updatedSavedCourses = userRecord.savedCourses.filter(id => id !== courseId);
      } else {
        // Add the course to savedCourses
        updatedSavedCourses = [...(userRecord.savedCourses || []), courseId];
      }

      // Update the user's saved courses in PocketBase
      await pb.collection('users').update(currentUserId, {
        savedCourses: updatedSavedCourses,
      });

      // Update the saved courses in localforage
      const cacheKey = `saved_courses_${currentUserId}`;
      const now = Date.now();

      // Fetch current cached data if available
      let cachedData: CachedData | null = await localforage.getItem(cacheKey);
      if (!cachedData) {
        cachedData = { savedCourses: [], cachedAt: now };
      }

      let updatedCachedCourses;
      if (isSaved) {
        // Remove course from cache
        updatedCachedCourses = cachedData.savedCourses.filter(course => course.id !== courseId);
      } else {
        // Fetch course details to add to cache
        const newCourse = await pb.collection('courses').getOne(courseId, { autoCancellation: false });
        updatedCachedCourses = [...cachedData.savedCourses, { id: newCourse.id }];
      }

      // Update the cache in localforage
      await localforage.setItem(cacheKey, {
        savedCourses: updatedCachedCourses,
        cachedAt: now,
      });

      // Update the isSaved state
      setIsSaved(!isSaved);

    } catch (error) {
      console.error('Error toggling save state:', error);
    }
  };


  useEffect(() => {
    const checkIfSaved = async () => {
      if (!currentUserId || !course?.id) return;

      try {
        // Fetch the user's saved courses from PocketBase
        const userRecord = await pb.collection('users').getOne(currentUserId, { autoCancellation: false });
        const savedCourses = userRecord.savedCourses || [];

        // Update isSaved state
        setIsSaved(savedCourses.includes(course.id));

      } catch (error) {
        console.error('Error checking if course is saved:', error);
      }
    };

    checkIfSaved();
  }, [currentUserId, course]);

  const reportReview = async (reviewId, userId) => {
    if (!currentUserId) {
      setPopupMessage('You must be logged in to report a review.');
      return;
    }
    try {
      // Create the data object using the correct relation record IDs
      const data = {
        review: reviewId,
        reporter: currentUserId,
        reviewCreator: userId
      };

      // Create the review report entry in PocketBase
      await pb.collection('reviewReports').create(data);
      // Set the popup message
      setPopupMessage('Review has been reported and will be reviewed further.');
    } catch (error) {
      console.error('Error reporting review:', error);
    }
  };

  // Function to copy tutor email to clipboard
  const copyEmail = (email) => {
    navigator.clipboard.writeText(email);
    setCopiedEmailMessage('Email copied');
    setTimeout(() => setCopiedEmailMessage(''), 2000);
  }

  // Function to toggle visibility of tutor list
  const toggleTutors = () => {
    setShowTutors((prev) => !prev);
  }

  const addTutor = async () => {
    if (!currentUserId || !course) {
      setPopupMessage('You must be logged in to tutor this course.');
      return;
    }
    if (isTutor) {
      setPopupMessage('You have already added yourself as a tutor for this course.');
      return;
    }
    try {
      // Use the array append operator '+' to add the current user to the course's tutors array
      await pb.collection('courses').update(course.id, {
        'tutors+': [currentUserId],
      });
  
      // Use the array append operator '+' to add the course to the user's courses_tutored array
      await pb.collection('users').update(currentUserId, {
        'courses_tutored+': [course.id],
      });
  
      setIsTutor(true);
      setPopupMessage('Successfully added as a tutor for this course.');
  
      // Fetch the updated course data
      const updatedCourse = await pb.collection('courses').getOne(course.id, {
        expand: 'reviews.user,reviews.professors,professors',
      });
  
      // Initialize state with the updated course data
      initializeState(updatedCourse);
    } catch (error) {
      console.error('Error adding tutor:', error);
      setPopupMessage('An error occurred while adding you as a tutor. Please try again.');
    }
  };  


  const initializeState = async (courseData) => {
    setCourse(courseData);
    setReviews(courseData.expand?.reviews || []);
    setProfessors(courseData.expand?.professors || []);

    const totalRating = courseData.expand?.reviews.reduce(
      (sum, review) => sum + (review.rating || 0),
      0
    );
    const avgRating = courseData.expand?.reviews.length
      ? totalRating / courseData.expand?.reviews.length
      : courseData.averageRating || 0;
    setAverageRating(avgRating);

    const fetchedTutors = courseData.tutors || [];
    const currentTutor = currentUserId ? fetchedTutors.includes(currentUserId) : false;
    setIsTutor(currentTutor);

    // Fetch tutor user details
    const fetchedTutorDetails = await fetchTutorDetails(fetchedTutors);
    setTutorDetails(fetchedTutorDetails);
  };



  if (loading) {
    return <Loading />
  }

  if (!course) {
    return <div className="flex items-center justify-center h-screen">Course not found</div>;
  }

  const filteredReviews = reviews.filter((review) => {
    const matchesProfessor = selectedProfessor
      ? review.expand?.professors?.some(
        (professor) => `${professor.firstName} ${professor.lastName}` === selectedProfessor
      )
      : true;

    const matchesRating = selectedRating > 0 ? review.rating >= selectedRating : true;


    const matchesSyllabus = hasSyllabus ? !!review.syllabus : true;
    return matchesProfessor && matchesRating && matchesSyllabus;
  });

  // Determine grid classes based on the number of reviews
  let gridClasses = "grid grid-cols-1 gap-6"; // default

  if (filteredReviews.length === 2) {
    gridClasses = "grid grid-cols-1 md:grid-cols-2 gap-6";
  } else if (filteredReviews.length >= 3) {
    gridClasses = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 lg:gap-8";
  }

  return (
    <>
      <div className="min-h-screen p-6 sm:p-8 lg:p-10 review-card max-w-screen-xl mx-auto">
        {/* Back to Search Link */}
        <div className="mb-8">
          <button
            className="text-white text-xl hover:bg-gray-400 transition duration-300 px-2 py-1 rounded"
            onClick={() => router.back()}
          >
            ← Back
          </button>
        </div>

        {/* Course Code and Name as Title */}
        <div className="flex flex-wrap items-start justify-between mb-6 course-details">
          {/* Title and Bookmark */}
          <div className="flex items-start flex-shrink mr-4 mb-2">
            <h1 className="text-white text-3xl md:text-4xl font-semibold mb-4 md:mb-0">
              {course.code}: {course.name}
            </h1>
            {/* Bookmark Button */}
            <Tooltip title={isSaved ? "Unsave Course" : "Save Course"}>
              <button
                data-testid={`save-button-${course.id}`}
                onClick={() => toggleSaveCourse(course.id)}
                className="text-black-500 hover:text-black-700 transition duration-300 text-3xl md:text-4xl ml-2 mt-1"
              >
                {isSaved ? (
                  <FaBookmark style={{ color: 'white' }} />
                ) : (
                  <FaRegBookmark style={{ color: 'white' }} />
                )}
              </button>
            </Tooltip>
          </div>

          {/* Buttons Section */}
          <div className="flex flex-wrap sm:flex-nowrap gap-4 mt-4 md:mt-0 flex-shrink-0">
            {course.syllabus && (
              <button
                aria-label="Download Syllabus"
                className="flex-grow bg-white text-black py-2 px-4 rounded-full shadow-lg hover:bg-gray-300 transition duration-300 text-center"
                onClick={() => window.open(course.syllabus, '_blank')}
                title="Download Syllabus"
              >
                Download Syllabus
              </button>
            )}
            <button
              className="flex-grow bg-white text-black py-2 px-4 rounded-full shadow-lg hover:bg-gray-300 transition duration-300 text-center"
              onClick={() => router.push(`/addReview?code=${course.code}&id=${course.id}`)}
            >
              Add a Review
            </button>
            <button
              className="flex-grow bg-white text-black py-2 px-4 rounded-full shadow-lg hover:bg-gray-300 transition duration-300 text-center"
              onClick={toggleTutors}
            >
              Find a Tutor
            </button>

            <button
              className="flex-grow bg-white text-black py-2 px-4 rounded-full shadow-lg hover:bg-gray-300 transition duration-300 text-center"
              onClick={addTutor}
            >
              Tutor this Course
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
          <div>
            <label htmlFor="professorFilter" className="text-white text-lg mr-2">Filter by Professor:</label>
            {professors.length > 0 ? (
              <select
                id="professorFilter"
                value={selectedProfessor}
                onChange={(e) => setSelectedProfessor(e.target.value)}
                className="p-2 rounded border bg-gray-200 px-3 py-2 rounded-full shadow-md  hover:bg-gray-300 transition"
              >
                <option value="" className="text-white">All Professors</option>
                {professors.map((professor, index) => {
                  const professorName = `${professor.firstName} ${professor.lastName}`.trim();
                  return (
                    <option key={index} value={professorName}>
                      {professorName}
                    </option>
                  );
                })}
              </select>
            ) : (
              <p className="text-gray-400 inline text-white text-lg">No professors found</p>
            )}
          </div>

          <div>
            <label htmlFor="ratingFilter" className="text-white text-lg mr-2">Filter by Rating:</label>
            <select
              id="ratingFilter"
              value={selectedRating}
              onChange={(e) => setSelectedRating(Number(e.target.value))}
              className="p-2 rounded border bg-gray-200 px-3 py-2 rounded-full shadow-md hover:bg-gray-300 transition"
            >
              <option value={0}>All Ratings</option>
              <option value={1}>1+</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
              <option value={5}>5 </option>
            </select>
          </div>

          <div className="flex items-center">
            <label htmlFor="syllabusFilter" className="text-white text-lg">
              Show Reviews with Syllabus Only:
            </label>
            <input
              type="checkbox"
              id="syllabusFilter"
              checked={hasSyllabus}
              onChange={(e) => setHasSyllabus(e.target.checked)}
              className="ml-2 transform scale-150"
            />

          </div>
        </div>

        {/* Popup Message */}
        {popupMessage && (
          <div className="fixed bottom-4 right-4 bg-blue-500 text-white p-4 rounded shadow-lg z-50">
            <p>{popupMessage}</p>
            <button
              className="mt-2 text-sm underline"
              onClick={() => setPopupMessage('')} // Close the popup
            >
              Close
            </button>
          </div>
        )}

        {/* Dropdown list for tutors */}
        {showTutors && (
          <>
            {/* Backdrop Overlay */}
            <div
              className="fixed inset-0 bg-black opacity-50 z-40"
              onClick={() => setShowTutors(false)} // Clicking outside closes the modal
            />

            {/* Popup Modal */}
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <div className="relative bg-white w-full max-w-lg p-6 rounded-lg shadow-lg overflow-auto">
                <div className="flex justify-between">
                  <h3 className="font-semibold text-lg">Tutors</h3>
                  <button
                    aria-label="Close"
                    onClick={() => setShowTutors(false)}
                    className="text-gray-600 hover:text-gray-900 transition duration-300"
                  >
                    <IoClose size={20} />
                  </button>
                </div>
                <div className="p-4">
                  {tutorDetails.length > 0 ? (
                    tutorDetails.map((tutor, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row items-center justify-between mb-4"
                      >
                        <Link href={`/profile/${tutor.id}`} className="transform hover:scale-110 transition-transform duration-200 hover:text-blue-700 hover:underline">

                          <div className="flex items-center">
                            <img
                              src={tutor.profilePicture || '/images/user.png'}
                              alt="Tutor Profile"
                              className="w-10 h-10 rounded-full object-cover"
                            />
                            <div className="flex-grow ml-2">
                              <span className="font-semibold">
                                {tutor.firstName && tutor.lastName
                                  ? `${tutor.firstName} ${tutor.lastName}`
                                  : 'Anonymous'}
                              </span>
                            </div>

                          </div>
                        </Link>
                        <button
                          onClick={() => copyEmail(tutor.email)}
                          className="mt-2 sm:mt-0 text-blue-500 hover:text-blue-900 transition duration-300"
                        >
                          Copy Email
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>No tutors available for this course</p>
                  )}
                  {/* Display copied message */}
                  {copiedEmailMessage && (
                    <p className="text-green-500 mt-2 text-center">
                      {copiedEmailMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Reviews Section with Average Rating */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4">
            {/* Number of tutors for the course */}
            <button
              onClick={toggleTutors}
              className="flex flex-col items-center space-y-1 focus:outline-none mb-4 md:mb-0 flex-1"
            >
              <div className="flex items-center space-x-2">
                <span className="text-4xl md:text-5xl font-bold text-gray-900">
                  {tutorDetails.length}
                </span>
                <FaChalkboardTeacher className="text-blue-500 text-4xl md:text-5xl" />
              </div>
              <p className="text-gray-500 text-center leading-tight text-sm md:text-base">
                Tutors for <br /> this Course
              </p>
            </button>

            {/* Average Rating Section */}
            <div className="flex flex-col items-center mb-4 md:mb-0 flex-1">
              <h2 className="text-2xl md:text-3xl font-semibold mt-2 text-center">Average Rating</h2>
              <div className="text-4xl md:text-5xl font-bold text-gray-900 mt-1">
                {averageRating.toFixed(1)}
              </div>
              <div className="mt-1">
                <StarRating rating={averageRating} readOnly={true} />
              </div>
            </div>

            {/* Number of reviews */}
            <div className="flex flex-col items-center space-y-1 flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-4xl md:text-5xl font-bold text-gray-900">
                  {reviews.length}
                </span>
                <FaUsers className="text-blue-500 text-4xl md:text-5xl" />
              </div>
              <p className="text-gray-500 text-center leading-tight text-sm md:text-base">
                Reviews for <br /> this Course
              </p>
            </div>
          </div>

          <div className="mt-6 mb-2">
            <h2 className="text-3xl font-semibold">Reviews</h2>
          </div>

          <div className="space-y-6">
            {filteredReviews.length === 0 ? (
              <p className="text-gray-600 text-lg">No reviews yet.</p>
            ) : (
              <div className={gridClasses}>
                {filteredReviews.map((review, index) => {
                  const user = review.expand?.user || {};
                  const profilePicture = user.profilePicture || '/images/user.png';
                  const syllabusUrl = review.syllabus
                    ? pb.files.getUrl(review, review.syllabus)
                    : null;
                  const rating = review.rating || 0;
                  const isAnonymous = review.anonymous;

                  // Determine display name based on the anonymous flag
                  const displayName = isAnonymous
                    ? 'Anonymous'
                    : user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : 'Anonymous';

                  return (
                    <div key={index} className="bg-white p-4 rounded-lg shadow-md h-full flex flex-col">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-start space-x-4">
                          {isAnonymous ? (
                            // If anonymous, display default profile picture without link
                            <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden">
                              <img src="/images/user.png" alt="Anonymous User" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            // If not anonymous, display profile picture with link
                            <Link href={`/profile/${user.id}`}
                              className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden transform hover:scale-110 transition-transform duration-200"
                            >
                              <img src={profilePicture} alt="User Profile" className="w-full h-full object-cover" />
                            </Link>
                          )}
                          <div className="flex-grow">
                            <div className="flex items-center space-x-2">
                              {isAnonymous ? (
                                // If anonymous, display name without link
                                <h3 className="font-semibold">
                                  {displayName}
                                </h3>
                              ) : (
                                // If not anonymous, display name with link
                                <Link href={`/profile/${user.id}`}>
                                  <h3 className="font-semibold hover:text-blue-700 transform hover:scale-110 hover:underline transition-transform duration-200">
                                    {displayName}
                                  </h3>
                                </Link>
                              )}
                            </div>
                            {/* Star Rating and Action Buttons */}
                            <div className="flex items-center justify-between mt-2 flex-wrap">
                              <div className="flex items-center space-x-2 whitespace-nowrap">
                                {/* Rating Number in a Small Box */}
                                <RatingBox rating={review.rating || 'N/A'} size="small" />
                                {/* Star Rating */}
                                <StarRating rating={review.rating} readOnly={true} />
                              </div>
                              {/* Action Buttons */}
                              <div className="flex items-center space-x-2 mt-2 sm:mt-0">
                                {/* Syllabus Download Button */}
                                {syllabusUrl && (
                                  <Tooltip title="Download Syllabus">
                                    <button
                                      aria-label="Download Syllabus"
                                      className="download-syllabus bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition duration-300 flex items-center justify-center"
                                      onClick={() => window.open(syllabusUrl, '_blank')}
                                    >
                                      <FaFileDownload className="text-xl" />
                                    </button>
                                  </Tooltip>
                                )}
                                {/* Report Review Button */}
                                <Tooltip title="Report Review">
                                  <button
                                    data-testid={`report-review-${review.id}`}
                                    aria-label="Report Review"
                                    onClick={() => reportReview(review.id, user.id)}
                                    className="text-red-500 hover:text-red-700 transition duration-300 flex items-center"
                                  >
                                    <FaFlag className="text-2xl" />
                                  </button>
                                </Tooltip>
                              </div>
                            </div>
                            {/* Review Comment */}
                            <p className="text-gray-600 mt-2">{review.comment}</p>
                            {/* Professor Name Box */}
                            {review.expand?.professors?.some((prof) => prof.firstName) && (
                              <div className="mt-2 p-1 border border-gray-300 rounded bg-gray-100 inline-block">
                                <h3 className="text-gray-800 font-semibold">
                                  Professor:{' '}
                                  {review.expand.professors
                                    .filter((prof) => prof.firstName)
                                    .map((prof, idx, filteredProfs) => (
                                      <span key={prof.id} className="font-normal">
                                        {prof.firstName} {prof.lastName}
                                        {idx < filteredProfs.length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                </h3>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function CourseDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CourseDetailPageComponent />
    </Suspense>
  );
}
