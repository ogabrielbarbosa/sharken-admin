export type Criteria = {
  minReviews: number;
  minRating: number;
  minPhotos: number;
  instagramActiveDays: number;
  recontactDays: number;
};

export const DEFAULT_CRITERIA: Criteria = {
  minReviews: 20,
  minRating: 4,
  minPhotos: 3,
  instagramActiveDays: 90,
  recontactDays: 180,
};
