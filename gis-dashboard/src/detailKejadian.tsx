// src/detailKejadian.tsx - ENHANCED VERSION WITH NAVIGATION AND CHARTTABS COMPONENT
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './detailKejadian.css';



import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { API_URL } from './api';

// Interface untuk data kejadian
interface KejadianData {
  id: number;
  title: string;
  provinsi: string;
  das: string;
  disaster_type: string;
  report_type: string;
  incident_date: string;
  description: string;
  longitude: number;
  latitude: number;
  thumbnail_url: string | null;
  images_urls: string[];
  created_at: string;

  korban_meninggal: number;
  korban_luka_luka: number;
  korban_mengungsi: number;
  rumah_rusak_berat: number;
  rumah_rusak_sedang: number;
  rumah_rusak_ringan: number;
  rumah_rusak_terendam: number;
  infrastruktur_rusak_berat: number;
  infrastruktur_rusak_sedang: number;
  infrastruktur_rusak_ringan: number;
  dampak_kebakaran: string;
  luas_lokasi_kejadian: number;
}

// Interface untuk kejadian map data (sesuai dengan yang digunakan di map)
interface KejadianMapData {
  id: number;
  title: string;
  provinsi: string;
  disaster_type: string;
  report_type: string;
  incident_date: string;
  latitude: number;
  longitude: number;
  thumbnail_url: string | null;
}

// Function to find kejadian closest to today's date - MOVED HERE for reuse
const findClosestToToday = (kejadianList: KejadianMapData[], currentKejadianId: number): number | null => {
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11
  const currentDay = today.getDate(); // 1-31
  
  let closestKejadian = null;
  let minDaysDifference = Infinity;

  console.log('Finding closest kejadian to today:', { 
    currentMonth: currentMonth + 1, 
    currentDay,
    totalKejadian: kejadianList.length 
  });

  for (const kejadian of kejadianList) {
    // Skip the current kejadian that's being viewed
    if (kejadian.id === currentKejadianId) continue;

    const kejadianDate = new Date(kejadian.incident_date);
    const kejadianMonth = kejadianDate.getMonth();
    const kejadianDay = kejadianDate.getDate();
    
    // Calculate difference in days within the year
    // Convert both dates to day of year for comparison
    const todayDayOfYear = getDayOfYear(currentMonth, currentDay);
    const kejadianDayOfYear = getDayOfYear(kejadianMonth, kejadianDay);
    
    // Calculate minimum distance considering year wrap-around
    let daysDifference = Math.abs(todayDayOfYear - kejadianDayOfYear);
    const yearWrapDifference = 365 - daysDifference;
    daysDifference = Math.min(daysDifference, yearWrapDifference);

    console.log(`Kejadian ${kejadian.id}: ${kejadian.incident_date}, dayOfYear: ${kejadianDayOfYear}, difference: ${daysDifference} days`);

    if (daysDifference < minDaysDifference) {
      minDaysDifference = daysDifference;
      closestKejadian = kejadian.id;
    }
  }

  console.log('Closest kejadian found:', { closestId: closestKejadian, minDays: minDaysDifference });
  return closestKejadian;
};

// Helper function to get day of year from month and day
const getDayOfYear = (month: number, day: number): number => {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let dayOfYear = day;
  
  for (let i = 0; i < month; i++) {
    dayOfYear += daysInMonth[i];
  }
  
  return dayOfYear;
};

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export function DetailKejadian() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<KejadianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [yearlyStats, setYearlyStats] = useState<Array<{year: number, count: number}>>([]);
  
  // States for year selection
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [isYearLoading, setIsYearLoading] = useState(false);

  // Load data kejadian from API
  useEffect(() => {
    const fetchKejadianData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/kejadian?id=${id}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch kejadian data');
        }
        
        const kejadianList = await response.json();
        
        // Find the specific kejadian by ID
        const kejadianData = kejadianList.find((item: any) => item.id === parseInt(id || '0'));
        
        if (!kejadianData) {
          throw new Error('Kejadian not found');
        }
        
        setData(kejadianData);
        
        // Set default selected year to the year of current kejadian
        const currentYear = new Date(kejadianData.incident_date).getFullYear();
        setSelectedYear(currentYear);
        
        // Fetch yearly statistics based on kejadian data
        await fetchYearlyStats(kejadianData);
        
      } catch (err) {
        console.error('Error fetching kejadian:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchKejadianData();
    }
  }, [id]);

  const fetchYearlyStats = async (kejadianData: KejadianData) => {
    try {
      const params = new URLSearchParams();
      
      // Selalu filter berdasarkan report_type dan disaster_type
      if (kejadianData.report_type) {
        params.append('report_type', kejadianData.report_type);
      }
      if (kejadianData.disaster_type) {
        params.append('disaster_type', kejadianData.disaster_type);
      }
      
      // Cek filter context dari sessionStorage untuk menentukan level filtering
      const storedFilterData = getStoredFilterData();
      
      if (storedFilterData) {
        // Jika filter berdasarkan DAS, gunakan DAS
        if (storedFilterData.locationType === 'DAS') {
          if (kejadianData.das && kejadianData.das.trim() !== '') {
            params.append('das', kejadianData.das);
          }
        } 
        // Jika filter berdasarkan Provinsi, gunakan Provinsi (dan abaikan DAS)
        else if (storedFilterData.locationType === 'Daerah Administratif') {
          if (kejadianData.provinsi) {
            params.append('provinsi', kejadianData.provinsi);
          }
        }
      } else {
        // Fallback: prioritas DAS, jika tidak ada gunakan provinsi
        if (kejadianData.das && kejadianData.das.trim() !== '') {
          params.append('das', kejadianData.das);
        } else if (kejadianData.provinsi) {
          params.append('provinsi', kejadianData.provinsi);
        }
      }
      
      console.log('Fetching yearly stats with context-aware filters:', {
        report_type: kejadianData.report_type,
        disaster_type: kejadianData.disaster_type,
        filterContext: storedFilterData?.locationType,
        usingLocation: storedFilterData?.locationType === 'DAS' ? kejadianData.das : kejadianData.provinsi
      });

      const response = await fetch(`${API_URL}/api/kejadian/yearly-stats?${params.toString()}`);
      if (response.ok) {
        const stats = await response.json();
        setYearlyStats(stats);
        console.log('Yearly stats loaded:', stats);
      } else {
        console.error('Failed to fetch yearly statistics');
        setYearlyStats([]);
      }
    } catch (error) {
      console.error('Error fetching yearly statistics:', error);
      setYearlyStats([]);
    }
  };

  // ENHANCED: Handle year selection with navigation to closest incident
  const handleYearClick = async (year: number) => {
    if (!data) return;
    
    const currentKejadianYear = new Date(data.incident_date).getFullYear();
    
    // If same year as current kejadian, no need to navigate
    if (year === currentKejadianYear) {
      setSelectedYear(year);
      return;
    }
    
    console.log(`Year ${year} clicked, finding closest kejadian and navigating...`);
    setIsYearLoading(true);
    
    try {
      // Fetch kejadian data for the selected year
      const params = new URLSearchParams();
      
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      params.append('start_date', startDate);
      params.append('end_date', endDate);
      
      // Apply same filters as current kejadian
      if (data.report_type) {
        params.append('report_type', data.report_type);
      }
      if (data.disaster_type) {
        params.append('disaster_type', data.disaster_type);
      }
      
      // Apply location filter based on stored filter context
      const storedFilterData = getStoredFilterData();
      if (storedFilterData) {
        if (storedFilterData.locationType === 'DAS' && data.das?.trim()) {
          params.append('das', data.das);
        } else if (storedFilterData.locationType === 'Daerah Administratif') {
          params.append('provinsi', data.provinsi);
        }
      } else {
        // Fallback
        if (data.das?.trim()) {
          params.append('das', data.das);
        } else {
          params.append('provinsi', data.provinsi);
        }
      }

      console.log('Fetching kejadian for year with params:', params.toString());

      const response = await fetch(`${API_URL}/api/kejadian?${params.toString()}`);
      
      if (response.ok) {
        const yearKejadianData: KejadianMapData[] = await response.json();
        console.log(`Found ${yearKejadianData.length} kejadian for year ${year}`);
        
        if (yearKejadianData.length > 0) {
          // Find closest kejadian to today's date
          const closestKejadianId = findClosestToToday(yearKejadianData, data.id);
          const targetKejadianId = closestKejadianId || yearKejadianData[0].id;
          
          console.log(`Navigating to kejadian ID: ${targetKejadianId} (closest to today)`);
          
          // Store filter data for the new page
          if (storedFilterData) {
            sessionStorage.setItem('lastFilterData', JSON.stringify(storedFilterData));
          }
          
          // Navigate to the closest kejadian's detail page
          navigate(`/detail-kejadian/${targetKejadianId}`);
        } else {
          console.log(`No kejadian found for year ${year}`);
          // Just update the selected year without navigation
          setSelectedYear(year);
        }
      } else {
        console.error('Failed to fetch kejadian for selected year');
        setSelectedYear(year);
      }
    } catch (error) {
      console.error('Error in handleYearClick:', error);
      setSelectedYear(year);
    } finally {
      setIsYearLoading(false);
    }
  };

  // Get filter data from sessionStorage (from previous filter selection)
  const getStoredFilterData = () => {
    try {
      const stored = sessionStorage.getItem('lastFilterData');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const storedFilterData = getStoredFilterData();

  const handlePhotoClick = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  const handleCloseModal = () => {
    setSelectedPhotoIndex(null);
  };

  const goToPrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPhotoIndex !== null && selectedPhotoIndex > 0 && data) {
      setSelectedPhotoIndex(selectedPhotoIndex - 1);
    }
  };

  const goToNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPhotoIndex !== null && data && selectedPhotoIndex < data.images_urls.length - 1) {
      setSelectedPhotoIndex(selectedPhotoIndex + 1);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="detail-bencana">
        <div className="loading-state" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Memuat data kejadian...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="detail-bencana">
        <div className="error-state" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Error: {error || 'Data tidak ditemukan'}</p>
          <button onClick={() => window.history.back()}>Kembali</button>
        </div>
      </div>
    );
  }

  // Default image for missing photos
  const defaultImage = 'https://via.placeholder.com/300x200?text=No+Image';
  
  // Prepare photos array with actual data
  const photos = data.images_urls.length > 0 ? data.images_urls.map(url => `${API_URL}${url}`) : [defaultImage];
  
  // Add thumbnail as first image if it exists and is different from images
  if (data.thumbnail_url && !data.images_urls.includes(data.thumbnail_url)) {
    photos.unshift(`${API_URL}${data.thumbnail_url}`);
  }

  const visiblePhotos = photos.slice(0, 4);
  const extraPhotosCount = photos.length - 4;

  // Map position from data coordinates
  const mapPosition: [number, number] = [data.latitude, data.longitude];

  return (
    <div className="detail-bencana">
      <h1 className="title">{data.title}</h1>

      {/* Map and Photos */}
      <div className="map-photos-container">
        <div className="map-image">
          {storedFilterData ? (
            <DetailMapWithMultipleMarkers 
              position={mapPosition}
              kejadianData={{
                id: data.id,
                title: data.title,
                provinsi: data.provinsi,
                disaster_type: data.disaster_type,
                report_type: data.report_type,
                incident_date: data.incident_date
              }}
              storedFilterData={storedFilterData}
              selectedYear={selectedYear}
              isYearLoading={isYearLoading}
            />
          ) : (
            <MapContainer
              center={mapPosition}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <Marker position={mapPosition}>
                <Popup>
                  <div>
                    <strong>{data.title}</strong><br />
                    {data.provinsi}<br />
                    {data.disaster_type} - {data.report_type}<br />
                    Tanggal: {new Date(data.incident_date).toLocaleDateString('id-ID')}
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          )}
        </div>
        <div className="photos-container">
          {visiblePhotos.map((photo, index) => (
            <div key={index} className="photo-wrapper">
              <img
                src={photo}
                alt={`Foto ${index + 1}`}
                className="photo"
                onClick={() => handlePhotoClick(index)}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = defaultImage;
                }}
              />
              {index === 3 && extraPhotosCount > 0 && (
                <div className="extra-photo-count" onClick={(e) => {
                  e.stopPropagation();
                  handlePhotoClick(index);
                }}>
                  +{extraPhotosCount}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* UPDATED: Detailed Statistic Component - Hidden for Kerawanan reports */}
      {data.report_type !== 'Kerawanan' && (
        <div className="detailed-statistic-wrapper">
          <div className="row1">
            <div className="row1-left">
              <h2 className="ds-title">Intensitas Kejadian Pertahun</h2>
              <h3 className="ds-subtitle">
                {data ? (
                  <>
                    Jumlah Kejadian {data.report_type} - {data.disaster_type} di {' '}
                    {data.das && data.das.trim() !== '' ? `DAS ${data.das}` : data.provinsi} Pertahun
                  </>
                ) : (
                  'Jumlah Kejadian Bencana Pertahun'
                )}
              </h3>
              <h3 className="ds-note">*Berdasarkan Rekap Pusdalops PB</h3>
              
              {/* Enhanced year selection info */}
              {/* {selectedYear && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px 16px',
                  backgroundColor: isYearLoading ? '#fef3c7' : '#eff6ff',
                  border: `1px solid ${isYearLoading ? '#f59e0b' : '#3b82f6'}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: isYearLoading ? '#92400e' : '#1e40af',
                  transition: 'all 0.3s ease'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {isYearLoading ? 
                      `⏳ Mencari kejadian terdekat di tahun ${selectedYear}...` : 
                      `📍 Tahun Aktif: ${selectedYear}`
                    }
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8, lineHeight: '1.4' }}>
                    {isYearLoading ? 
                      'Akan berpindah ke kejadian yang tanggalnya paling dekat dengan hari ini...' :
                      'Klik tahun lain yang memiliki kejadian untuk berpindah ke kejadian terdekat'
                    }
                  </div>
                </div>
              )} */}
            </div>
            
            {/* YearStat components with navigation capability */}
            <div className="row1-right">
              {yearlyStats.length > 0 ? (
                yearlyStats.map((stat, index) => (
                  <YearStat 
                    key={stat.year}
                    year={stat.year} 
                    count={stat.count} 
                    index={index}
                    onYearClick={handleYearClick} // Enhanced click handler with navigation
                    isActive={selectedYear === stat.year}
                  />
                ))
              ) : (
                // Fallback to empty stats while loading
                Array.from({ length: 10 }, (_, i) => {
                  const year = new Date().getFullYear() - 9 + i;
                  return (
                    <YearStat 
                      key={year}
                      year={year} 
                      count={0} 
                      index={i}
                      onYearClick={handleYearClick}
                      isActive={selectedYear === year}
                    />
                  );
                })
              )}
            </div>
          </div>
          {/* Row 2 */}
                <div className="row2">
                  <h2 className="ds2-title">Data Dampak Kejadian Bencana</h2>
                  <h3 className="ds2-subtitle">Rincian Dampak Kejadian Bencana</h3>
                </div>
          
                {/* Row 3*/}
                <div className="row3">
                  {/* Col 1 */}
                  <div className="col">
                    <StatisticList
                      image="/images/death.png"
                      imageSize={50}
                      number={data.korban_meninggal || 0}
                      metric="Jiwa"
                      description="Hilang / /n Meninggal Dunia"
                    />
                    <StatisticList
                      image="/images/person.png"
                      imageSize={50}
                      number={data.korban_luka_luka || 0}
                      metric="Jiwa"
                      description="Luka-luka"
                    />
                    <StatisticList
                      image="/images/family.png"
                      imageSize={50}
                      number={data.korban_mengungsi || 0}
                      metric="Jiwa"
                      description="Menderita dan /n Terdampak bencana"
                    />
                  </div>
                  {/* Col 2 */}
                  <div className="col">
                    <StatisticList
                      image="/images/house-lighter-pink.png"
                      imageSize={50}
                      number={data.rumah_rusak_ringan || 0}
                      metric="Unit"
                      description="Rumah Rusak Ringan"
                    />
                    <StatisticList
                      image="/images/house-pink.png"
                      imageSize={50}
                      number={data.rumah_rusak_sedang || 0}
                      metric="Unit"
                      description="Rumah Rusak Sedang"
                    />
                    <StatisticList
                      image="/images/house-red.png"
                      imageSize={50}
                      number={data.rumah_rusak_berat || 0}
                      metric="Unit"
                      description="Rumah Rusak Berat"
                    />
                    <StatisticList
                      image="/images/house-drowned.png"
                      imageSize={50}
                      number={data.rumah_rusak_terendam || 0}
                      metric="Unit"
                      description="Rumah Tergenang"
                    />
                  </div>
                  {/* Col 3 */}
                  <div className="col">
                    <StatisticList
                      image="/images/bridge.png"
                      imageSize={90}
                      number={
                        (data.infrastruktur_rusak_ringan || 0) + 
                        (data.infrastruktur_rusak_sedang || 0) + 
                        (data.infrastruktur_rusak_berat || 0)
                      }
                      metric="Unit"
                      description={`Infrastruktur Rusak sbb:\n- ${data.infrastruktur_rusak_ringan || 0} Unit Rusak Ringan\n- ${data.infrastruktur_rusak_sedang || 0} Unit Rusak Sedang\n- ${data.infrastruktur_rusak_berat || 0} Unit Rusak Berat\nmeliputi: Jalan, Jembatan maupun plengsengan/TPT.`}
          
                    />
                  </div>
                  {/* Col 4 */}
                  <div className="col">
                   <StatisticList
                      image="/images/facilities.png"
                      imageSize={70}
                      number={2}
                      metric="Unit"
                      description="Fasilitas Umum/ /n Sosial Rusak"
                    />
                    <StatisticList
                      image="/images/book.png"
                      imageSize={70}
                      number={2}
                      metric="Unit"
                      description="Fasilitas Pendidikan/n Rusak"
                    />
                  </div>
                  {/* Col 5 */}
                  <div className="col">
                    <StatisticList
                      image="/images/cow.png"
                      imageSize={60}
                      number={"-"}
                      metric=""
                      description="Ternak Mati"
                    />
                    <StatisticList
                      image="/images/bush.png"
                      imageSize={70}
                      number={2}
                      metric="Unit"
                      description="Lahan Rusak"
                    />
                    <StatisticList
                      image="/images/trees.png"
                      imageSize={70}
                      number={data.luas_lokasi_kejadian || 0}
                      metric="km²"
                      description="Luas Lokasi Kejadian"
                    />
                  </div>
                </div>
        </div>
      )}

      {/* REPLACED: Chart Tabs Section - Using ChartTabsComponent */}
      <ChartTabsComponent 
        disasterType={
          data.disaster_type.toLowerCase() === 'kebakaran' ? 'kebakaran' :
          data.disaster_type.toLowerCase() === 'longsor' ? 'longsor' :
          data.disaster_type.toLowerCase() === 'banjir' ? 'banjir' :
          'kebakaran'
        }
        kejadianId={data.id}
        className="mt-6"
        isInMockup={false}
      />

      {/* CONDITIONAL DESCRIPTION SECTION - Hidden for Kerawanan reports */}
      {data.report_type !== 'Kerawanan' && (
        <div className="description mt-6">
          <div className="description-content">
            <h2 className="description-title">Laporan Kebencanaan</h2>
            {/* Description text - Only show for non-Kerawanan */}
            {data.description && data.description.trim() !== '' && data.description !== '1' && (
              <p className="description-text text-justify">
                {data.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal for Photo Gallery */}
      {selectedPhotoIndex !== null && (
        <div className="photo-modal-overlay" onClick={handleCloseModal}>
          <button
            className="modal-prev-button"
            onClick={goToPrevPhoto}
            disabled={selectedPhotoIndex === 0}
            aria-label="Foto Sebelumnya"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="m14 16-4-4 4-4"/>
            </svg>
          </button>

          <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-button"
              onClick={handleCloseModal}
              aria-label="Tutup Galeri"
            >
              ×
            </button>
            <img
              src={photos[selectedPhotoIndex]}
              alt={`Foto Besar ${selectedPhotoIndex + 1}`}
              className="photo-modal-image"
              onError={(e) => {
                (e.target as HTMLImageElement).src = defaultImage;
              }}
            />
            <div className="photo-modal-thumbnails">
              {photos.map((photo, index) => (
                <img
                  key={index}
                  src={photo}
                  alt={`Thumbnail Foto ${index + 1}`}
                  className={`photo-thumbnail ${index === selectedPhotoIndex ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPhotoIndex(index);
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = defaultImage;
                  }}
                />
              ))}
            </div>
          </div>

          <button
            className="modal-next-button"
            onClick={goToNextPhoto}
            disabled={selectedPhotoIndex === photos.length - 1}
            aria-label="Foto Berikutnya"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="m10 8 4 4-4 4"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default DetailKejadian;