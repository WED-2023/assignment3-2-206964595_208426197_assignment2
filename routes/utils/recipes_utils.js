const axios = require("axios");
require("dotenv").config();
const db = require("./MySql");
const api_domain = "https://api.spoonacular.com/recipes";
const DButils = require("./DButils");



async function getRecipeInformation(recipe_id) {
  return await axios.get(`${api_domain}/${recipe_id}/information`, {
    params: {
      includeNutrition: false,
      apiKey: process.env.spoonacular_apiKey
    }
  });
}
//TEST
async function getRecipeDetails(recipeId, user_id) {
  let recipe;

  if (!isNaN(recipeId)) {
    // Spoonacular
    const recipe_info = await getRecipeInformation(recipeId);
    recipe = {
      id: recipe_info.data.id,
      title: recipe_info.data.title,
      readyInMinutes: recipe_info.data.readyInMinutes,
      image: recipe_info.data.image,
      popularity: recipe_info.data.aggregateLikes || 0,
      vegan: recipe_info.data.vegan,
      vegetarian: recipe_info.data.vegetarian,
      glutenFree: recipe_info.data.glutenFree,
      servings: recipe_info.data.servings,
      // ADD THESE LINES for ingredients and instructions:
      extendedIngredients: recipe_info.data.extendedIngredients,
      analyzedInstructions: recipe_info.data.analyzedInstructions,
      instructions: recipe_info.data.instructions // fallback
    };
  } else {
    // Personal or Family recipe
    // First try myrecipes
    let results = await DButils.execQuery(
      `SELECT * FROM myrecipes WHERE id = ?`,
      [recipeId]
    );
    
    // If not found in myrecipes, try familyrecipes
    if (results.length === 0) {
      results = await DButils.execQuery(
        `SELECT * FROM familyrecipes WHERE id = ?`,
        [recipeId]
      );
    }
    
    if (results.length === 0) {
      throw { status: 404, message: "Recipe not found" };
    }
    
    recipe = results[0];
    
    // Parse JSON ingredients if it's a string
    if (typeof recipe.ingredients === "string") {
      try {
        recipe.ingredients = JSON.parse(recipe.ingredients);
      } catch (e) {
        console.error('Failed to parse ingredients:', e);
        // Keep as string if parsing fails
      }
    }
  }

  // Get extra likes from recipe_likes table
  const likes_result = await DButils.execQuery(
    `SELECT extra_likes FROM recipe_likes WHERE recipe_id = ?`,
    [recipeId]
  );
  const extraLikes = likes_result.length > 0 ? likes_result[0].extra_likes : 0;
  recipe.popularity = (recipe.popularity || 0) + extraLikes;

  return recipe;
}
async function getExploreRecipes(user_id) {
  // Always use Spoonacular for explore recipes - no database recipes
  let recipeIds = [];

  try {
    const response = await axios.get(`${api_domain}/random`, {
      params: {
        number: 3,
        apiKey: process.env.spoonacular_apiKey
      }
    });
    recipeIds = response.data.recipes.map(r => r.id);
  } catch (error) {
    console.error('Error fetching random recipes from Spoonacular:', error);
    throw { status: 500, message: 'Failed to fetch explore recipes' };
  }

  return await getRecipesPreview(recipeIds, user_id);
}
async function createPersonalRecipe(user_id, recipeData) {
  const {
    title,
    image,
    readyInMinutes,
    ingredients,
    instructions,
    vegan,
    vegetarian,
    glutenFree,
    intolerance
  } = recipeData;

  const id = await generateUniqueId("p", "myrecipes");
  const intolerances = await detectAndSaveIntolerances(id, ingredients);

  const sql = `
    INSERT INTO myrecipes (
      id, user_id, title, image, readyInMinutes, ingredients,
      instructions, vegan, vegetarian, glutenFree, intolerances
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await db.query(sql, [
    id,
    user_id,
    title,
    image,
    readyInMinutes,
    JSON.stringify(ingredients),
    instructions,
    vegan,
    vegetarian,
    glutenFree,
    JSON.stringify(intolerances)
  ]);

  return id;
}



async function getFamilyRecipesByUser(user_id) {
  const sql = `
    SELECT id, user_id, title, image, readyInMinutes AS Time,
           aggregateLikes AS popularity, vegan, vegetarian, glutenFree,
           recipeOwner, occasion, ingredients, instructions, servings, intolerances
    FROM familyrecipes
    WHERE user_id = ?
  `;
  const results = await db.query(sql, [user_id]);

  

  return results.map(recipe => ({
    ...recipe,
  intolerances:
    (() => {
      try {
        if (!recipe.intolerances) return [];
        return typeof recipe.intolerances === "string"
          ? JSON.parse(recipe.intolerances)
          : recipe.intolerances;
      } catch (e) {
        console.error(" Error parsing intolerances:", recipe.id, recipe.intolerances);
        return [];
      }
    })(),
    isWatched: false,
    isFavorite: false
  }));
}

async function getFamilyRecipeById(recipeId, user_id) {
  const sql = `
    SELECT id, user_id, title, image, readyInMinutes AS Time,
           aggregateLikes AS popularity, vegan, vegetarian, glutenFree,
           recipeOwner, occasion, ingredients, instructions, servings, intolerances
    FROM familyrecipes
    WHERE id = ? AND user_id = ?
  `;
  const results = await db.query(sql, [recipeId, user_id]);

  if (results.length === 0) {
    throw { status: 404, message: "Family recipe not found" };
  }

  const recipe = results[0];

  return {
    id: recipe.id,
    title: recipe.title,
    image: recipe.image,
    Time: recipe.Time,
    popularity: recipe.popularity,
    vegan: recipe.vegan,
    vegetarian: recipe.vegetarian,
    glutenFree: recipe.glutenFree,
    recipeOwner: recipe.recipeOwner,
    occasion: recipe.occasion,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    servings: recipe.servings,
    intolerances: JSON.parse(recipe.intolerances || "[]"),
    isWatched: false,
    isFavorite: false
  };
}



async function createFamilyRecipe(user_id, recipeData) {
  const {
    title,
    image,
    readyInMinutes,
    ingredients,
    instructions,
    servings,
    recipeOwner,
    occasion,
    vegan,
    vegetarian,
    glutenFree,
    intolerance 
  } = recipeData;

  const id = await generateUniqueId("f", "familyrecipes");
  const intolerances = await detectAndSaveIntolerances(id, ingredients);

  const sql = `
    INSERT INTO familyrecipes (
      id, user_id, title, image, readyInMinutes, ingredients,
      instructions, servings, recipeOwner, occasion,
      vegan, vegetarian, glutenFree, intolerances
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await db.query(sql, [
    id,
    user_id,
    title,
    image,
    readyInMinutes,
    JSON.stringify(ingredients),
    instructions,
    servings,
    recipeOwner,
    occasion,
    vegan,
    vegetarian,
    glutenFree,
    JSON.stringify(intolerances) 
  ]);

  return id;
}



async function searchRecipes({ query, number = 5, cuisine, diet, intolerance, includePersonal = false }) {
  try {
    if (!query) {
      throw { status: 400, message: "Query parameter is required" };
    }

    const allowed = [5, 10, 15];
    const limit = allowed.includes(Number(number)) ? Number(number) : 5;
    const intoleranceArray = intolerance ? intolerance.split(",").map(s => s.trim()) : [];

    let mappedDbResults = [];

    if (includePersonal) {
      let sql = `
        (
          SELECT id, title, image, readyInMinutes AS Time,
                aggregateLikes AS popularity, vegan, vegetarian, glutenFree
          FROM myrecipes
          WHERE title LIKE ?
      `;
      const bindings = [`%${query}%`];

      if (diet === "vegan") sql += ` AND vegan = true`;
      else if (diet === "vegetarian") sql += ` AND vegetarian = true`;
      else if (diet === "glutenFree") sql += ` AND glutenFree = true`;

      if (intoleranceArray.length) {
        sql += ` AND NOT JSON_OVERLAPS(intolerances, ?)`;
        bindings.push(JSON.stringify(intoleranceArray));
      }

      sql += `)
      UNION
      (
        SELECT id, title, image, readyInMinutes AS Time,
              aggregateLikes AS popularity, vegan, vegetarian, glutenFree
        FROM familyrecipes
        WHERE title LIKE ?`;
      bindings.push(`%${query}%`);

      if (diet === "vegan") sql += ` AND vegan = true`;
      else if (diet === "vegetarian") sql += ` AND vegetarian = true`;
      else if (diet === "glutenFree") sql += ` AND glutenFree = true`;

      if (intoleranceArray.length) {
        sql += ` AND NOT JSON_OVERLAPS(intolerances, ?)`;
        bindings.push(JSON.stringify(intoleranceArray));
      }

      sql += `)
      LIMIT ?`;
      bindings.push(limit);

      const dbResults = await db.query(sql, bindings);

      mappedDbResults = dbResults.map((r) => ({
        id: r.id,
        image: r.image,
        title: r.title,
        Time: r.Time,
        popularity: r.popularity,
        vegan: r.vegan,
        vegetarian: r.vegetarian,
        glutenFree: r.glutenFree,
        isWatched: false,
        isFavorite: false
      }));
    }

    // --- Spoonacular
    let detailedRecipes = [];
    try {
      const spoonacularResponse = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
        params: {
          query,
          number: limit,
          cuisine,
          diet,
          intolerances: intolerance,
          apiKey: process.env.spoonacular_apiKey
        }
      });

      const ids = spoonacularResponse.data.results.map(r => r.id);

      detailedRecipes = await Promise.all(ids.map(async (id) => {
        const info = await axios.get(`https://api.spoonacular.com/recipes/${id}/information`, {
          params: { includeNutrition: false, apiKey: process.env.spoonacular_apiKey }
        });
        const r = info.data;
        return {
          id: r.id,
          image: r.image,
          title: r.title,
          Time: r.readyInMinutes,
          popularity: r.aggregateLikes,
          vegan: r.vegan,
          vegetarian: r.vegetarian,
          glutenFree: r.glutenFree,
          isWatched: false,
          isFavorite: false
        };
      }));
    } catch (spoonErr) {
      console.warn(" Spoonacular API failed, returning only DB results:", spoonErr.message);
    }


    return [...mappedDbResults, ...detailedRecipes];

  } catch (error) {
    console.error("searchRecipes error:", error.message);
    throw error;
  }
}



async function getRecipesPreview(recipe_ids, user_id = null) {
  const previews = [];

  for (const id of recipe_ids) {
    try {
      let recipe;

      if (!isNaN(id)) {
        // Spoonacular
        const response = await getRecipeInformation(id);
        const r = response.data;

        recipe = {
          id: r.id,
          title: r.title,
          image: r.image,
          Time: r.readyInMinutes,
          popularity: r.aggregateLikes || 0, // Base likes from Spoonacular
          vegan: r.vegan,
          vegetarian: r.vegetarian,
          glutenFree: r.glutenFree,
        };
      } else {
        // DB: personal/family - Use DButils instead of db
        const sql = `
          SELECT id, title, image, readyInMinutes AS Time,
                 aggregateLikes AS popularity, vegan, vegetarian, glutenFree
          FROM myrecipes
          WHERE id = ?
          UNION
          SELECT id, title, image, readyInMinutes AS Time,
                 aggregateLikes AS popularity, vegan, vegetarian, glutenFree
          FROM familyrecipes
          WHERE id = ?
        `;
        const results = await DButils.execQuery(sql, [id, id]);
        if (results.length === 0) continue;
        recipe = results[0];
        recipe.popularity = recipe.popularity || 0;
      }


      const extraLikesResult = await DButils.execQuery(
        `SELECT COUNT(*) AS count FROM recipe_likes WHERE recipe_id = ?`,
        [id]
      );
      const extraLikes = extraLikesResult[0]?.count || 0;
      recipe.popularity = recipe.popularity + extraLikes;


      if (user_id) {
        // Check if recipe is in user's favorites
        const favRows = await DButils.execQuery(
          `SELECT 1 FROM favoriterecipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, id]
        );
        
        // Check if recipe has been watched
        const watchedRows = await DButils.execQuery(
          `SELECT 1 FROM watched_recipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, id]
        );
        
        recipe.isFavorite = favRows && favRows.length > 0;
        recipe.isWatched = watchedRows && watchedRows.length > 0;
      } else {
        recipe.isFavorite = false;
        recipe.isWatched = false;
      }

      previews.push(recipe);
    } catch (err) {
      console.error(`Failed to fetch preview for recipe ${id}:`, err.message);
    }
  }

  return previews;
}

async function detectAndSaveIntolerances(recipeId, ingredients) {
  const intoleranceMap = {
    dairy: ["milk", "cheese", "cream", "butter", "yogurt"],
    egg: ["egg"],
    gluten: ["flour", "wheat", "pasta", "bread"],
    peanut: ["peanut", "peanut butter"],
    shellfish: ["shrimp", "crab", "lobster"],
    soy: ["soy", "tofu"],
    treeNut: ["almond", "cashew", "walnut"],
    wheat: ["wheat", "flour"],
    sesame: ["sesame"],
    sulfite: ["sulfite"],
    grain: ["flour", "bread", "rice"],
    seafood: ["tuna", "salmon", "shrimp"]
  };

  const lowerIngredients = ingredients.map(i =>
    typeof i === "string" ? i.toLowerCase() : i.name?.toLowerCase()
  );

  const detected = new Set();

  for (const [intolerance, keywords] of Object.entries(intoleranceMap)) {
    for (const keyword of keywords) {
      if (lowerIngredients.some(ing => ing.includes(keyword))) {
        detected.add(intolerance);
        break;
      }
    }
  }

  const intolerancesArray = Array.from(detected);
  const intoleranceJSON = JSON.stringify(intolerancesArray);

  // Determine which table to update
  let table = null;
  if (isNaN(recipeId)) {
    table = recipeId.startsWith("f") ? "familyrecipes" : "myrecipes";
  } else {
    // Spoonacular recipe — no update
    return intolerancesArray;
  }

  const sql = `UPDATE ${table} SET intolerances = ? WHERE id = ?`;
  await db.query(sql, [intoleranceJSON, recipeId]);

  return intolerancesArray;
}


async function generateUniqueId(prefix, table) {
  let suffix = 1;
  let id;
  while (true) {
    id = `${prefix}_${suffix}`;
    const result = await db.query(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    if (result.length === 0) break;
    suffix++;
  }
  return id;
}

async function getRecipeLikeCount(recipe_id) {
  const result = await DButils.execQuery(
    `SELECT COUNT(*) AS likes FROM recipe_likes WHERE recipe_id = ?`,
    [recipe_id]
  );
  return result[0].likes;
}



module.exports = {
  getRecipeInformation,
  getRecipeDetails,
  getExploreRecipes,
  getFamilyRecipesByUser,
  getFamilyRecipeById,
  searchRecipes,
  getRecipesPreview,
  detectAndSaveIntolerances,
  generateUniqueId,
  getRecipeLikeCount,
  createPersonalRecipe,
  createFamilyRecipe
  
};
