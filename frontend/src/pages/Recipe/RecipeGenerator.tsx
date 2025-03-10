import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from '../../api/axiosConfig.tsx';
import { AxiosError, isAxiosError } from 'axios';
import RecipeCard from '../../components/recipe/AIGeneratedMealCard';
import IngredientsInput from '../../components/GeneratorIngredientsInput';
import { NutritionalInformation } from '../../types/recipe';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { useToast } from '../../context/ToastContext';
import { ToastType } from '../../components/common/Toast';

interface RecipeDetails {
  ingredientsList: string[];
  equipmentNeeded: string[];
  instructions: string[];
  servingSuggestions: string[];
  nutritionalInformation: NutritionalInformation;
}

interface RecipeResponse {
  mealName: string;
  ingredientsUsed: string[];
  recipeDetails: RecipeDetails;
  imageUrl: string;
}

type GeneratedMealResponse = RecipeResponse;

const RecipeGenerator: React.FC = () => {
  // -----------------------------
  // State variables
  // -----------------------------
  const [ingredients, setIngredients] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<GeneratedMealResponse | null>(null);
  const [copySuccess, setCopySuccess] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const { showToast } = useToast();

  // Timeout reference for clearing copy success message
  const copyTimeoutRef = useRef<number | null>(null);

  // -----------------------------
  // Effects
  // -----------------------------
  useEffect(() => {
    // Initialize AOS animations
    AOS.init({ duration: 1000, easing: 'ease-out-cubic', once: true });

    // Cleanup any leftover timeouts on unmount
    return () => {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // -----------------------------
  // Callbacks
  // -----------------------------
  const formatRecipeDetails = useCallback((details: RecipeDetails): string => {
    return `
Ingredients:
${details.ingredientsList.join('\n')}

Equipment Needed:
${details.equipmentNeeded.join('\n')}

Instructions:
${details.instructions.join('\n')}

Serving Suggestions:
${details.servingSuggestions.join('\n')}

Nutritional Information:
Calories: ${details.nutritionalInformation.calories}
Protein: ${details.nutritionalInformation.protein}
Carbohydrates: ${details.nutritionalInformation.carbohydrates}
Fat: ${details.nutritionalInformation.fat}
    `.trim();
  }, []);

  const handleCopyToClipboard = useCallback(() => {
    if (recipe?.recipeDetails) {
      navigator.clipboard
        .writeText(formatRecipeDetails(recipe.recipeDetails as RecipeDetails))
        .then(() => {
          setCopySuccess('Recipe details copied to clipboard!');
          showToast('Recipe details copied to clipboard!', 'success');
        })
        .catch(() => {
          setCopySuccess('Failed to copy recipe details.');
          showToast('Failed to copy recipe details.', 'error');
        });

      // Reset copy success message after 3 seconds
      copyTimeoutRef.current = window.setTimeout(() => setCopySuccess(''), 3000);
    }
  }, [recipe, formatRecipeDetails, showToast]);

  const handleToggleFavorite = useCallback(() => {
    setIsFavorite(prev => !prev);
    showToast(isFavorite ? 'Removed from favorites' : 'Added to favorites', 'favorite');
  }, [isFavorite, showToast]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      
      setLoading(true);
      setRecipe(null);

      // Split and trim the user-input ingredients
      const ingredientsArray = ingredients
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      if (ingredientsArray.length === 0) {
        showToast('Please enter at least one ingredient.', 'error');
        setLoading(false);
        return;
      }

      // Validate ingredient input format
      if (ingredientsArray.some(item => item.length < 2)) {
        showToast('Please enter valid ingredients (at least 2 characters each).', 'error');
        setLoading(false);
        return;
      }

      try {
        // Call the backend API
        const response = await axios.post<RecipeResponse>('/v1/recipes/generate-meal', {
          ingredients: ingredientsArray,
        });
        
        // Process the response data
        const recipeData = {
          ...response.data,
          recipeDetails: {
            ...response.data.recipeDetails,
            instructions: response.data.recipeDetails.instructions.map(instruction => {
              return instruction.replace(/^(\d+\.|\d+\)|\d+|Step \d+:)\s+/i, '');
            }),
            nutritionalInformation: {
              calories: String(response.data.recipeDetails.nutritionalInformation?.calories || ''),
              protein: String(response.data.recipeDetails.nutritionalInformation?.protein || ''),
              carbohydrates: String(response.data.recipeDetails.nutritionalInformation?.carbohydrates || ''),
              fat: String(response.data.recipeDetails.nutritionalInformation?.fat || ''),
            },
          },
        };
        
        setRecipe(recipeData);
        showToast('Recipe generated successfully!', 'success');
      } catch (err: unknown) {
        console.error('Error generating recipe:', err);
        
        if (isAxiosError(err)) {
          const axiosError = err as AxiosError<any>;
          
          // Check for friendlyMessage first (highest priority)
          if ((axiosError as any).friendlyMessage) {
            showToast((axiosError as any).friendlyMessage, 'error', 6000);
            return;
          }
          
          // Then check for response.data.friendlyMessage
          if (axiosError.response?.data?.friendlyMessage) {
            showToast(axiosError.response.data.friendlyMessage, 'error', 6000);
            return;
          }
          
          // Handle response errors
          if (axiosError.response) {
            let errorMessage = '';
            
            switch (axiosError.response.status) {
              case 400:
                errorMessage = 'Please check your ingredients and try again. Try specific ingredients like "chicken, rice, tomatoes".';
                break;
              case 401:
                errorMessage = 'Your session has expired. Please log in again to continue.';
                break;
              case 403:
                errorMessage = 'This feature requires authentication. Please log in to generate recipes.';
                break;
              case 500:
                errorMessage = 'The recipe service is temporarily unavailable. Please try again later.';
                break;
              default:
                // Use server message if available, otherwise use friendly message
                errorMessage = axiosError.response.data?.message || 'Error generating recipe. Please try again.';
            }
            
            showToast(errorMessage, 'error', 6000);
            return;
          }
          
          // Handle network errors
          if (axiosError.request) {
            showToast('Unable to connect to the recipe service. Please check your internet connection.', 'error', 6000);
            return;
          }
          
          // Default axios error message
          showToast('Error generating recipe. Please try again.', 'error', 6000);
          return;
        }
        
        // Handle non-axios errors
        if (err instanceof Error) {
          showToast(`Error: ${err.message}`, 'error', 6000);
          return;
        }
        
        // Fallback error message
        showToast('An unexpected error occurred. Please try again.', 'error', 6000);
      } finally {
        setLoading(false);
      }
    },
    [ingredients, showToast]
  );

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="w-full overflow-x-hidden max-w-6xl mx-auto px-4 py-10">
      <div className="relative w-full">
        <div 
          className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-amber-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 rounded-3xl opacity-50"
          aria-hidden="true"
        />

        <div className="relative w-full max-w-3xl mx-auto bg-white dark:bg-gray-800 bg-opacity-90 dark:bg-opacity-90 backdrop-blur-sm rounded-3xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-700 dark:from-blue-400 dark:to-indigo-300 text-center mb-8">
            Discover Your Recipe
          </h1>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <IngredientsInput ingredients={ingredients} onChange={setIngredients} />
            <button
              type="submit"
              disabled={!ingredients.trim() || loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 text-white font-bold text-xl shadow-md transition-all duration-300 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Recipe...
                </>
              ) : (
                'Generate Recipe'
              )}
            </button>
          </form>

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center mt-12">
              <div className="w-16 h-16 border-t-4 border-b-4 border-blue-500 rounded-full animate-spin mb-4"></div>
              <p className="text-lg text-gray-600 dark:text-gray-300">Creating your perfect recipe...</p>
            </div>
          )}

          {/* Generated recipe card */}
          {recipe && !loading && (
            <div data-aos="fade-up" className="mt-8">
              <RecipeCard
                recipe={recipe}
                isFavorite={isFavorite}
                copySuccess={copySuccess}
                onCopy={handleCopyToClipboard}
                onToggleFavorite={handleToggleFavorite}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipeGenerator;
