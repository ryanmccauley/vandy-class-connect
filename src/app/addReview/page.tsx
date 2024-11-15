'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Loading from "../components/Loading";
import StarRating from '../components/StarRating';
import { useAuth } from '../lib/contexts';
import pb from "../lib/pocketbaseClient";

function AddReviewComponent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const courseId = searchParams.get('id');
    const { userData } = useAuth();
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [professorFirstName, setProfessorFirstName] = useState('');
    const [professorLastName, setProfessorLastName] = useState('');
    const [syllabusFile, setSyllabusFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [wordCount, setWordCount] = useState(0);
    const maxWordCount = 400;
    const userId = userData?.id;

    const handleCommentChange = (e) => {
        const newComment = e.target.value;
        const words = newComment.trim().split(/\s+/).filter(Boolean); // Split by whitespace and remove empty strings
        setComment(newComment);
        setWordCount(words.length);
    };

    useEffect(() => {
        if (!courseId) return;

        const fetchCourse = async () => {
            try {
                const fetchedCourse = await pb.collection('courses').getOne(courseId, { autoCancellation: false });

                setCourse(fetchedCourse);
            } catch (error) {
                console.error('Error fetching course:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCourse();
    }, [courseId]);

    // Handling syllabus file upload
    const handleFileChange = (e) => {
        setSyllabusFile(e.target.files[0]);
    };

    const handleSave = async () => {
        if (wordCount > maxWordCount) {
            setError(`Your comment exceeds the maximum word limit of ${maxWordCount} words.`);
            return;
        }

        if (!rating || rating <= 0) {
            setError('Please provide a valid rating.');
            return;
        }

        if (!comment.trim()) {
            setError('Please provide a comment.');
            return;
        }
        setSaving(true);
        setError('');

        try {
            // Check if the professor exists
            const professorFilter = `firstName="${professorFirstName.trim()}" && lastName="${professorLastName.trim()}"`;
            const existingProfessors = await pb.collection('professors').getFullList({
                filter: professorFilter,
                autoCancellation: false
            });

            let professorId;
            if (existingProfessors.length > 0) {
                // Professor exists
                professorId = existingProfessors[0].id;
            } else {
                // Create new professor
                const newProfessor = await pb.collection('professors').create({
                    firstName: professorFirstName.trim(),
                    lastName: professorLastName.trim(),
                    course: courseId,
                });
                professorId = newProfessor.id;
            }

            // Create the review
            const reviewData = {
                course: courseId,
                rating,
                comment,
                user: userData.id,
                syllabus: syllabusFile,
                professors: [professorId], // Add professor relation
            };

            const newReview = await pb.collection('reviews').create(reviewData);

            // Update the course
            const existingProfessorIds = course.professors || [];
            const updatedProfessors = [...new Set([...existingProfessorIds, professorId])];

            const existingReviewIds = course.reviews || [];
            const updatedReviews = [...existingReviewIds, newReview.id];

            // Optionally, fetch existing reviews to calculate the average rating
            const existingReviews = await pb.collection('reviews').getFullList({
                filter: `course="${courseId}"`,
                autoCancellation: false
            });

            const totalRating = existingReviews.reduce((sum, review) => sum + (review.rating || 0), 0) + newReview.rating;
            const avgRating = totalRating / (existingReviews.length + 1);

            await pb.collection('courses').update(courseId, {
                reviews: updatedReviews,
                averageRating: avgRating,
                professors: updatedProfessors,
            });

            // Upload syllabus file if present
            if (syllabusFile) {
                const formData = new FormData();
                formData.append('syllabus', syllabusFile);
                await pb.collection('courses').update(courseId, formData);
            }

            const fetchedUserReviews = await pb.collection('users').getOne(userId, {
                expand: 'reviews'
            });

            const userReviews = [...(fetchedUserReviews.reviews || []), newReview.id];

            await pb.collection('users').update(userId, {
                reviews: userReviews
            });
            router.push(`/course?id=${courseId}`);
        } catch (error) {
            console.error('Error saving review:', error);
            setError('Error saving review.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <Loading />
    }

    if (!course) {
        return <div>Course not found</div>;
    }

    const handleRatingChange = (newRating: number) => {
        setRating(newRating);
    };

    return (
        <div className="min-h-screen p-6">
            {/* Back to Course Link */}
            <div className="mb-8">
                <button
                    className="text-white text-lg"
                    onClick={() => router.push(`/course?id=${courseId}`)}
                    aria-label="Back to Course Page"
                >
                    ← Back to Course Page
                </button>
            </div>

            {/* Course Title */}
            <div className="mb-6">
                <h1 className="text-white text-4xl font-bold text-left">
                    {course.code}: {course.name}
                </h1>
            </div>

            {/* Add Review Section */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-3xl font-semibold hover:bg-gray-300 transition duration-300">Add a Review</h2>

                {/* Rating Input Section with Stars */}
                <div className="flex items-center mt-4">
                    <label htmlFor="rating" className="text-lg font-semibold mr-2">
                        Rating:<span className="text-red-500">*</span>
                    </label>
                    {/* Input for Rating */}
                    <input
                        type="number"
                        className="w-12 p-2 border border-gray-300 rounded mr-2"
                        max="5"
                        min="0"
                        step="0.1" // Allows for partial ratings like 3.4
                        value={rating}
                        aria-label="Rating Input"
                        onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value)) {
                                setRating(value);
                            } else {
                                setRating(0);
                            }
                        }}
                        placeholder="Rating"
                    />
                    {/* Dynamically render larger stars based on the input */}
                    <StarRating rating={rating} onRatingChange={handleRatingChange} size={40} />

                    {/* Upload Syllabus Section */}
                    <div className="ml-8">
                        <label htmlFor="syllabus-upload" className="text-lg font-semibold mr-3">
                            Upload Syllabus:
                        </label>
                        <input
                            id="syllabus-upload"
                            type="file"
                            className="mt-2"
                            accept=".pdf"
                            onChange={handleFileChange}
                        />
                    </div>
                </div>
                <div className="flex items-center mt-4 space-x-4">
                    <input
                        type="text"
                        className="w-2/5 p-2 border border-gray-300 rounded"
                        placeholder="Professor's First Name"
                        value={professorFirstName}
                        onChange={(e) => setProfessorFirstName(e.target.value)}
                    />
                    <input
                        type="text"
                        className="w-2/5 p-2 border border-gray-300 rounded"
                        placeholder="Professor's Last Name"
                        value={professorLastName}
                        onChange={(e) => setProfessorLastName(e.target.value)}
                    />
                </div>

                {/* Comment Input */}
                <div className="relative mt-4">
                    <textarea
                        className="w-full p-4 border border-gray-300 rounded-lg mt-1"
                        rows={5}
                        placeholder="Enter your review here..."
                        value={comment}
                        onChange={handleCommentChange}
                    />
                    {/* Position the asterisk outside the top-right corner of the textarea */}
                    <span className="absolute top-0 -right-4 text-red-500 text-xl">*</span>
                    <div className="text-right mt-1 text-sm">
                        <span className={wordCount > maxWordCount ? 'text-red-500' : 'text-gray-500'}>
                            {wordCount}/{maxWordCount} words
                        </span>
                    </div>
                    {wordCount > maxWordCount && (
                        <div className="text-red-500 mt-2">
                            Your comment exceeds the maximum word limit of {maxWordCount} words.
                        </div>
                    )}
                </div>


                {/* Save Button */}
                <div className="mt-6">
                    <button
                        className={`bg-blue-500 text-white py-2 px-6 rounded-lg shadow-lg hover:bg-blue-700 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Review'}
                    </button>
                </div>
                {/* Error Message */}
                {error && <div className="text-red-500 mt-2 mb-1">{error}</div>}
            </div>
        </div>
    );
}

export default function AddReviewPage() {
    return (
        <Suspense fallback={<Loading />}>
            <AddReviewComponent />
        </Suspense>
    );
}