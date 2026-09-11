import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./header";
import { API_URL } from "./api";

const Kebencanaan = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerClusterGroupRef = useRef(null);
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState("grid");
  const [searchText, setSearchText] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("All Lokasi");
  const [selectedCategory, setSelectedCategory] = useState("Kategori");
  const [sortBy, setSortBy] = useState("Newest Listings");
  const [distanceRadius, setDistanceRadius] = useState(75);
  const [distanceEnabled, setDistanceEnabled] = useState(true);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showDistanceDropdown, setShowDistanceDropdown] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [mapBounds, setMapBounds] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showItemsPerPageDropdown, setShowItemsPerPageDropdown] =
    useState(false);
  const [incidents, setIncidents] = useState([]);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(true);
  const [selectedDisasterTypes, setSelectedDisasterTypes] = useState<string[]>(
    [],
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingKejadianId, setEditingKejadianId] = useState(null);

  // Form data untuk modal tambah kejadian
  const [formData, setFormData] = useState({
    thumbnail: null,
    thumbnailPreview: null,
    images: [],
    title: "",
    description: "",
    incidentDate: "",
    lokasi: "",
    disasterType: "",
    das: "",
    longitude: "",
    latitude: "",
    curahHujan: null,
    isLoadingRainfall: false,
    isLoadingLocation: false,
    locationError: "",
    dasError: "",
    rainfallError: "",
    featured: true,
  });

  const handleEditKejadian = async (incident: any) => {
    // Set edit mode
    setIsEditMode(true);
    setEditingKejadianId(incident.id);

    // Reverse mapping category ke disaster type
    const reverseCategoryMapping = {
      Banjir: "Banjir",
      "Tanah Longsor dan Erosi": "Longsor",
      "Kebakaran Hutan dan Kekeringan": "Kebakaran",
    };

    // Populate form with existing data
    setFormData({
      title: incident.title || "",
      description: incident.description || "",
      incidentDate: incident.date || "",
      lokasi: incident.location || "",
      disasterType:
        reverseCategoryMapping[incident.category] || incident.category || "",
      das: incident.das || "",
      longitude: incident.longitude?.toString() || "",
      latitude: incident.latitude?.toString() || "",
      curahHujan: incident.curah_hujan || null,
      isLoadingRainfall: false,
      featured: incident.featured || false,
      thumbnail: null, // Will show preview dari existing
      thumbnailPreview: incident.thumbnail_path
        ? `${API_URL}${incident.thumbnail_path}`
        : null,
      images: [], // Will show preview dari existing
    });

    // Set existing images preview
    if (incident.images_paths && incident.images_paths.length > 0) {
      // Convert existing image paths to preview URLs
      const existingImagePreviews = incident.images_paths.map(
        (path) => `${API_URL}${path}`,
      );
      // You can store these in a separate state for preview if needed
    }

    // Trigger DAS loading based on location if needed
    if (incident.location) {
      // DAS akan auto-load dari useEffect yang sudah ada
    }

    // Open modal
    setShowAddModal(true);
  };

  // Tambahkan state untuk DAS options
  const [dasOptions, setDasOptions] = useState<string[]>([]);
  const [isLoadingDas, setIsLoadingDas] = useState(false);

  const reverseGeocode = async (lat, lon) => {
    if (!lat || !lon) return;

    try {
      setFormData((prev) => ({
        ...prev,
        isLoadingLocation: true,
        locationError: "",
      }));

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=id`,
        {
          headers: {
            "User-Agent": "KejadianBencanaApp/1.0",
          },
        },
      );
      const data = await response.json();

      if (data.address) {
        const village = data.address.village || data.address.suburb || "";
        const district = data.address.county || "";
        const city =
          data.address.city ||
          data.address.town ||
          data.address.city_district ||
          "";
        const province = data.address.state || "";

        const lokasi = [village, district, city, province]
          .filter(Boolean)
          .join(", ");

        setFormData((prev) => ({ ...prev, lokasi, isLoadingLocation: false }));

        // Fetch DAS berdasarkan koordinat
        await fetchDasByCoordinates(lon, lat);

        // TAMBAH: Fetch rainfall data jika sudah ada tanggal
        if (formData.incidentDate) {
          await fetchRainfallData(lat, lon, formData.incidentDate);
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          isLoadingLocation: false,
          locationError: "Tidak dapat menemukan lokasi untuk koordinat ini",
        }));
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      setFormData((prev) => ({
        ...prev,
        isLoadingLocation: false,
        locationError: "Error mengambil data lokasi",
      }));
    }
  };

  useEffect(() => {
    if (formData.incidentDate && formData.latitude && formData.longitude) {
      fetchRainfallData(
        parseFloat(formData.latitude),
        parseFloat(formData.longitude),
        formData.incidentDate,
      );
    }
  }, [formData.incidentDate]);

  const fetchDasByCoordinates = async (longitude: number, latitude: number) => {
    if (!longitude || !latitude) {
      setFormData((prev) => ({ ...prev, das: "" }));
      return;
    }

    try {
      setIsLoadingDas(true);
      setFormData((prev) => ({ ...prev, dasError: "" }));

      const response = await fetch(
        `${API_URL}/api/das/by-coordinates?longitude=${longitude}&latitude=${latitude}`,
      );

      const data = await response.json();

      if (data.success && data.das) {
        console.log("DAS found for coordinates:", data.das);
        setFormData((prev) => ({ ...prev, das: data.das }));

        if (data.isNearest) {
          console.log(
            "Note: Using nearest DAS (point outside all DAS polygons)",
          );
          setFormData((prev) => ({
            ...prev,
            dasError: "Menggunakan DAS terdekat (koordinat di luar area DAS)",
          }));
        }
      } else {
        console.log("No DAS found for coordinates");
        setFormData((prev) => ({
          ...prev,
          das: "",
          dasError: "Tidak dapat menemukan DAS untuk koordinat ini",
        }));
      }
    } catch (error) {
      console.error("Error fetching DAS by coordinates:", error);
      setFormData((prev) => ({
        ...prev,
        das: "",
        dasError: "Error mengambil data DAS",
      }));
    } finally {
      setIsLoadingDas(false);
    }
  };

  // Handle modal form input change
  const handleModalInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Auto-fill lokasi dan DAS saat longitude/latitude berubah
    if (name === "longitude" || name === "latitude") {
      const lat = name === "latitude" ? value : formData.latitude;
      const lon = name === "longitude" ? value : formData.longitude;

      clearTimeout(window.geocodeTimeout);
      window.geocodeTimeout = setTimeout(() => {
        if (lat && lon) {
          const latNum = parseFloat(lat);
          const lonNum = parseFloat(lon);

          if (!isNaN(latNum) && !isNaN(lonNum)) {
            // Reverse geocode untuk lokasi
            reverseGeocode(latNum, lonNum);
            // Fetch DAS berdasarkan koordinat sudah dipanggil dalam reverseGeocode
          }
        }
      }, 500);
    }
  };

  // Handle modal file change
  const handleModalFileChange = (e) => {
    const { name, files } = e.target;
    if (files) {
      if (name === "thumbnail") {
        const file = files[0];
        setFormData((prev) => ({
          ...prev,
          thumbnail: file,
          thumbnailPreview: URL.createObjectURL(file),
        }));
      } else if (name === "images") {
        // Gabungkan file baru dengan file yang sudah ada sebelumnya
        setFormData((prev) => ({
          ...prev,
          images: [...prev.images, ...Array.from(files)],
        }));
      }
    }
  };

  // Handle remove thumbnail
  const handleRemoveThumbnail = () => {
    if (formData.thumbnailPreview) {
      URL.revokeObjectURL(formData.thumbnailPreview);
    }
    setFormData((prev) => ({
      ...prev,
      thumbnail: null,
      thumbnailPreview: null,
    }));
  };

  // Handle modal form submit
  const handleModalSubmit = async (e) => {
    e.preventDefault();

    console.log("Form submitted!");

    try {
      const token = localStorage.getItem("adminToken");

      // Mapping disaster type
      const categoryMapping = {
        Banjir: "Banjir",
        Longsor: "Tanah Longsor dan Erosi",
        Kebakaran: "Kebakaran Hutan dan Kekeringan",
      };

      // Gunakan FormData untuk upload file
      const formDataToSend = new FormData();
      formDataToSend.append("title", formData.title);
      formDataToSend.append(
        "category",
        categoryMapping[formData.disasterType] || formData.disasterType,
      );
      formDataToSend.append("incidentDate", formData.incidentDate);
      formDataToSend.append("location", formData.lokasi);
      formDataToSend.append("das", formData.das || "");
      formDataToSend.append("longitude", formData.longitude);
      formDataToSend.append("latitude", formData.latitude);
      formDataToSend.append(
        "curahHujan",
        formData.curahHujan !== null ? formData.curahHujan.toString() : "",
      );
      formDataToSend.append("featured", formData.featured);
      formDataToSend.append("description", formData.description || "");

      // Append thumbnail (hanya jika ada file baru)
      if (formData.thumbnail) {
        formDataToSend.append("thumbnail", formData.thumbnail);
      }

      // Append multiple images (hanya jika ada file baru)
      formData.images.forEach((image) => {
        formDataToSend.append("images", image);
      });

      // Determine endpoint and method based on mode
      const url = isEditMode
        ? `${API_URL}/api/kejadian/${editingKejadianId}`
        : `${API_URL}/api/kejadian/add`;

      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method: method,
        headers: {
          Authorization: `Bearer ${token}`,
          // JANGAN set Content-Type, biar browser set otomatis untuk FormData
        },
        body: formDataToSend,
      });

      const data = await response.json();

      if (data.success) {
        alert(
          isEditMode
            ? "Kejadian berhasil diupdate!"
            : "Kejadian berhasil ditambahkan!",
        );
        setShowAddModal(false);

        // Reset form
        setFormData({
          thumbnail: null,
          thumbnailPreview: null,
          images: [],
          title: "",
          description: "",
          incidentDate: "",
          lokasi: "",
          disasterType: "",
          das: "",
          longitude: "",
          latitude: "",
          curahHujan: null,
          isLoadingRainfall: false,
          featured: true,
        });
        setDasOptions([]);
        setIsLoadingDas(false);
        setIsEditMode(false);
        setEditingKejadianId(null);

        fetchIncidents();
      } else {
        alert(
          (isEditMode
            ? "Gagal update kejadian: "
            : "Gagal menambahkan kejadian: ") + data.message,
        );
      }
    } catch (error) {
      console.error("Submit error:", error);
      alert(
        (isEditMode
          ? "Terjadi kesalahan saat update kejadian: "
          : "Terjadi kesalahan saat menambahkan kejadian: ") + error.message,
      );
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const fetchRainfallData = async (
    latitude: number,
    longitude: number,
    date: string,
  ) => {
    if (!latitude || !longitude || !date) {
      console.log("Missing data for rainfall fetch:", {
        latitude,
        longitude,
        date,
      });
      return;
    }

    try {
      setFormData((prev) => ({
        ...prev,
        isLoadingRainfall: true,
        rainfallError: "",
      }));

      console.log("Fetching rainfall data for:", { latitude, longitude, date });

      const response = await fetch(
        `${API_URL}/api/weather/rainfall?latitude=${latitude}&longitude=${longitude}&date=${date}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch rainfall: ${response.status}`);
      }

      const data = await response.json();

      console.log("Rainfall data received:", data);

      if (data.success) {
        setFormData((prev) => ({
          ...prev,
          curahHujan: data.rainfall,
          isLoadingRainfall: false,
          rainfallError: "",
        }));

        // Show notification
        if (data.rainfall > 0) {
          console.log(`✅ Curah hujan otomatis terisi: ${data.rainfall} mm`);
        } else {
          console.log(`ℹ️ Tidak ada data curah hujan untuk tanggal ${date}`);
        }
      }
    } catch (error) {
      console.error("Error fetching rainfall:", error);
      setFormData((prev) => ({
        ...prev,
        curahHujan: null,
        isLoadingRainfall: false,
        rainfallError: "Error mengambil data curah hujan",
      }));
    }
  };

  const fetchIncidents = async () => {
    try {
      setIsLoadingIncidents(true);
      const response = await fetch(`${API_URL}/api/kejadian/list`);
      const data = await response.json();

      if (data.success) {
        const transformedData = data.data.map((item) => {
          // Parse images_paths jika berbentuk string
          let imagesPaths = [];
          if (item.images_paths) {
            if (typeof item.images_paths === "string") {
              // Jika string, split atau parse
              try {
                imagesPaths = JSON.parse(item.images_paths);
              } catch {
                // Jika gagal parse, coba split
                imagesPaths = item.images_paths
                  .split("/uploads/")
                  .filter(Boolean)
                  .map((path) => "/uploads/" + path);
              }
            } else if (Array.isArray(item.images_paths)) {
              imagesPaths = item.images_paths;
            }
          }

          return {
            id: item.id,
            title: item.title,
            image: item.thumbnail_path
              ? `${API_URL}${item.thumbnail_path}`
              : "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
            category: item.category,
            type: item.category.toLowerCase().includes("banjir")
              ? "banjir"
              : item.category.toLowerCase().includes("longsor")
                ? "longsor"
                : "kebakaran",
            date: new Date(item.date).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            location: item.location,
            das: item.das,
            coordinates: [item.latitude, item.longitude],
            featured: item.featured,
            description: item.description,
            images_paths: imagesPaths, // Array yang sudah di-parse
            curah_hujan: item.curah_hujan,
          };
        });

        setIncidents(transformedData);
      }
    } catch (error) {
      console.error("Error fetching incidents:", error);
    } finally {
      setIsLoadingIncidents(false);
    }
  };

  const handleDeleteKejadian = async (id) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus kejadian ini?")) {
      return;
    }

    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch(`${API_URL}/api/kejadian/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        alert("Kejadian berhasil dihapus");
        fetchIncidents(); // Refresh list
      } else {
        alert("Gagal menghapus kejadian: " + data.message);
      }
    } catch (error) {
      console.error("Error deleting kejadian:", error);
      alert("Terjadi kesalahan saat menghapus kejadian");
    }
  };

  // Toggle featured status
  const handleToggleFeatured = async (id, currentStatus) => {
    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch(`${API_URL}/api/kejadian/${id}/featured`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ featured: !currentStatus }),
      });

      const data = await response.json();

      if (data.success) {
        fetchIncidents(); // Refresh list
      } else {
        alert("Gagal mengubah status featured: " + data.message);
      }
    } catch (error) {
      console.error("Error toggling featured:", error);
      alert("Terjadi kesalahan saat mengubah status featured");
    }
  };

  // Check authentication on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const token = localStorage.getItem("adminToken");
      const userStr = localStorage.getItem("adminUser");

      if (token && userStr) {
        try {
          const response = await fetch(`${API_URL}/api/admin/verify`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          const data = await response.json();

          if (data.success) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem("adminToken");
            localStorage.removeItem("adminUser");
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error("Token verification failed:", error);
          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminUser");
          setIsAuthenticated(false);
        }
      }
    };

    checkExistingSession();
  }, []);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    setIsAuthenticated(false);
  };

  // Handle form input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle file change
  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files) {
      if (name === "thumbnail") {
        setFormData((prev) => ({ ...prev, thumbnail: files[0] }));
      } else if (name === "images") {
        setFormData((prev) => ({ ...prev, images: Array.from(files) }));
      } else if (name === "dataFiles") {
        setFormData((prev) => ({ ...prev, dataFiles: Array.from(files) }));
      }
    }
  };

  // Handle submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch(`${API_URL}/api/kejadian/add`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        alert("Kejadian berhasil ditambahkan!");
        setShowAddModal(false);
        setFormData({
          thumbnail: null,
          images: [],
          title: "",
          description: "",
          incidentDate: "",
          provinsi: "",
          kabupaten: "",
          kecamatan: "",
          kelurahan: "",
          disasterType: "",
          das: "",
          dataFiles: [],
          longitude: "",
          latitude: "",
        });
      } else {
        alert("Gagal menambahkan kejadian: " + data.message);
      }
    } catch (error) {
      console.error("Submit error:", error);
      alert("Terjadi kesalahan saat menambahkan kejadian");
    }
  };

  // Extended dummy data with more incidents across Indonesia
  const dummyIncidents = [
    {
      id: 1,
      title: "Kebakaran Hutan terjadi di Riau sejak awal tahun ini.",
      image:
        "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
      category: "Kebakaran Hutan dan Kekeringan",
      type: "kebakaran",
      date: "23 Mei 2025",
      location: "Kampar, Riau",
      address: "Jalan H. Saman",
      das: "serayu",
      coordinates: [0.3397, 101.1427],
      featured: true,
    },
    {
      id: 2,
      title: "Sejumlah warga terdampak banjir di Blora",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "22 Mei 2025",
      location: "Blora, Jawa Tengah",
      address: "Kecamatan Blora",
      das: "serayu",
      coordinates: [-6.9698, 111.4194],
      featured: true,
    },
    {
      id: 3,
      title: "Ribuan warga terdampak banjir di Karawang",
      image: "https://images.unsplash.com/photo-1551522435-a13afa10f103?w=400",
      category: "Banjir",
      type: "banjir",
      date: "21 Mei 2025",
      location: "Karawang, Jawa Barat",
      address: "Kecamatan Telukjambe",
      das: "serayu",
      coordinates: [-6.3064, 107.302],
      featured: true,
    },
    {
      id: 4,
      title: "Longsor melanda desa di Cianjur",
      image: "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
      category: "Tanah Longsor dan Erosi",
      type: "longsor",
      date: "20 Mei 2025",
      location: "Cianjur, Jawa Barat",
      address: "Desa Gasol",
      das: "serayu",
      coordinates: [-6.8166, 107.1427],
      featured: false,
    },
    {
      id: 5,
      title: "Kekeringan melanda wilayah Gunungkidul",
      image:
        "https://images.unsplash.com/photo-1534809027769-b00d750a6410?w=400",
      category: "Kebakaran Hutan dan Kekeringan",
      type: "kebakaran",
      date: "19 Mei 2025",
      location: "Gunungkidul, DI Yogyakarta",
      address: "Kecamatan Wonosari",
      das: "serayu",
      coordinates: [-7.9781, 110.5964],
      featured: false,
    },
    {
      id: 6,
      title: "Banjir bandang terjadi di Garut",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "18 Mei 2025",
      location: "Garut, Jawa Barat",
      address: "Kecamatan Tarogong",
      das: "serayu",
      coordinates: [-7.2206, 107.9079],
      featured: false,
    },
    {
      id: 7,
      title: "Banjir merendam pemukiman warga di Bandung",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "17 Mei 2025",
      location: "Bandung, Jawa Barat",
      das: "serayu",
      coordinates: [-6.9175, 107.6191],
      featured: false,
    },
    {
      id: 8,
      title: "Longsor terjadi di jalur Puncak",
      image: "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
      category: "Tanah Longsor dan Erosi",
      type: "longsor",
      date: "16 Mei 2025",
      location: "Bogor, Jawa Barat",
      das: "serayu",
      coordinates: [-6.5971, 106.806],
      featured: false,
    },
    {
      id: 9,
      title: "Banjir rob melanda pesisir Indramayu",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "15 Mei 2025",
      location: "Indramayu, Jawa Barat",
      das: "serayu",
      coordinates: [-6.3269, 108.3199],
      featured: false,
    },
    {
      id: 10,
      title: "Banjir melanda Semarang",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "14 Mei 2025",
      location: "Semarang, Jawa Tengah",
      das: "serayu",
      coordinates: [-6.9667, 110.4167],
      featured: true,
    },
    {
      id: 11,
      title: "Longsor di Wonosobo tutup akses jalan",
      image: "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
      category: "Tanah Longsor dan Erosi",
      type: "longsor",
      date: "13 Mei 2025",
      location: "Wonosobo, Jawa Tengah",
      das: "serayu",
      coordinates: [-7.3631, 109.9036],
      featured: false,
    },
    {
      id: 12,
      title: "Banjir di Pekalongan merendam ratusan rumah",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "12 Mei 2025",
      location: "Pekalongan, Jawa Tengah",
      das: "serayu",
      coordinates: [-6.8886, 109.6753],
      featured: false,
    },
    {
      id: 13,
      title: "Banjir bandang terjadi di Malang",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "11 Mei 2025",
      location: "Malang, Jawa Timur",
      das: "serayu",
      coordinates: [-7.9797, 112.6304],
      featured: true,
    },
    {
      id: 14,
      title: "Longsor di kawasan Bromo",
      image: "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
      category: "Tanah Longsor dan Erosi",
      type: "longsor",
      date: "10 Mei 2025",
      location: "Probolinggo, Jawa Timur",
      das: "serayu",
      coordinates: [-7.7543, 113.2159],
      featured: false,
    },
    {
      id: 15,
      title: "Banjir melanda Surabaya",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "9 Mei 2025",
      location: "Surabaya, Jawa Timur",
      das: "serayu",
      coordinates: [-7.2575, 112.7521],
      featured: false,
    },
    {
      id: 16,
      title: "Kebakaran hutan meluas di Jambi",
      image:
        "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
      category: "Kebakaran Hutan dan Kekeringan",
      type: "kebakaran",
      date: "8 Mei 2025",
      location: "Jambi, Jambi",
      das: "serayu",
      coordinates: [-1.6101, 103.6131],
      featured: true,
    },
    {
      id: 17,
      title: "Banjir bandang di Padang",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "7 Mei 2025",
      location: "Padang, Sumatera Barat",
      das: "serayu",
      coordinates: [-0.9471, 100.4172],
      featured: false,
    },
    {
      id: 18,
      title: "Longsor terjadi di Bukittinggi",
      image: "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
      category: "Tanah Longsor dan Erosi",
      type: "longsor",
      date: "6 Mei 2025",
      location: "Bukittinggi, Sumatera Barat",
      das: "serayu",
      coordinates: [-0.3055, 100.3692],
      featured: false,
    },
    {
      id: 19,
      title: "Banjir melanda Medan",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "5 Mei 2025",
      location: "Medan, Sumatera Utara",
      das: "serayu",
      coordinates: [3.5952, 98.6722],
      featured: false,
    },
    {
      id: 20,
      title: "Kebakaran hutan di Palembang",
      image:
        "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
      category: "Kebakaran Hutan dan Kekeringan",
      type: "kebakaran",
      date: "4 Mei 2025",
      location: "Palembang, Sumatera Selatan",
      das: "serayu",
      coordinates: [-2.9761, 104.7754],
      featured: false,
    },
    {
      id: 21,
      title: "Kebakaran hutan meluas di Pontianak",
      image:
        "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
      category: "Kebakaran Hutan dan Kekeringan",
      type: "kebakaran",
      date: "3 Mei 2025",
      location: "Pontianak, Kalimantan Barat",
      das: "serayu",
      coordinates: [-0.0263, 109.3425],
      featured: true,
    },
    {
      id: 22,
      title: "Banjir di Banjarmasin",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "2 Mei 2025",
      location: "Banjarmasin, Kalimantan Selatan",
      das: "serayu",
      coordinates: [-3.3194, 114.59],
      featured: false,
    },
    {
      id: 23,
      title: "Kebakaran hutan di Balikpapan",
      image:
        "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
      category: "Kebakaran Hutan dan Kekeringan",
      type: "kebakaran",
      date: "1 Mei 2025",
      location: "Balikpapan, Kalimantan Timur",
      das: "serayu",
      coordinates: [-1.2379, 116.8529],
      featured: false,
    },
    {
      id: 24,
      title: "Banjir bandang di Makassar",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "30 Apr 2025",
      location: "Makassar, Sulawesi Selatan",
      das: "serayu",
      coordinates: [-5.1477, 119.4327],
      featured: false,
    },
    {
      id: 25,
      title: "Longsor di Manado",
      image: "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
      category: "Tanah Longsor dan Erosi",
      type: "longsor",
      date: "29 Apr 2025",
      location: "Manado, Sulawesi Utara",
      das: "serayu",
      coordinates: [1.4748, 124.8421],
      featured: false,
    },
    {
      id: 26,
      title: "Banjir rob di Denpasar",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "28 Apr 2025",
      location: "Denpasar, Bali",
      das: "serayu",
      coordinates: [-8.6705, 115.2126],
      featured: false,
    },
    {
      id: 27,
      title: "Longsor di kawasan Gunung Rinjani",
      image: "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
      category: "Tanah Longsor dan Erosi",
      type: "longsor",
      date: "27 Apr 2025",
      location: "Lombok, Nusa Tenggara Barat",
      das: "serayu",
      coordinates: [-8.5833, 116.1167],
      featured: false,
    },
    {
      id: 28,
      title: "Banjir melanda Jayapura",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "26 Apr 2025",
      location: "Jayapura, Papua",
      das: "serayu",
      coordinates: [-2.592, 140.6689],
      featured: false,
    },
    {
      id: 29,
      title: "Banjir merendam Jakarta Utara",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "25 Apr 2025",
      location: "Jakarta Utara, DKI Jakarta",
      das: "serayu",
      coordinates: [-6.1381, 106.8634],
      featured: true,
    },
    {
      id: 30,
      title: "Banjir di Tangerang Selatan",
      image: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
      category: "Banjir",
      type: "banjir",
      date: "24 Apr 2025",
      location: "Tangerang Selatan, Banten",
      das: "serayu",
      coordinates: [-6.29, 106.72],
      featured: false,
    },
  ];

  const provinces = [
    "All Lokasi",
    "Bali",
    "Bangka Belitung",
    "Banten",
    "Bengkulu",
    "DI Yogyakarta",
    "DKI Jakarta",
    "Gorontalo",
    "Jambi",
    "Jawa Barat",
    "Jawa Tengah",
    "Jawa Timur",
    "Kalimantan Barat",
    "Kalimantan Selatan",
    "Kalimantan Tengah",
    "Kalimantan Timur",
    "Kalimantan Utara",
    "Kepulauan Riau",
    "Lampung",
    "Maluku",
    "Maluku Utara",
    "Nusa Tenggara Barat",
    "Nusa Tenggara Timur",
    "Papua",
    "Papua Barat",
    "Riau",
    "Sulawesi Barat",
    "Sulawesi Selatan",
    "Sulawesi Tengah",
    "Sulawesi Tenggara",
    "Sulawesi Utara",
    "Sumatera Barat",
    "Sumatera Selatan",
    "Sumatera Utara",
  ];

  const categories = [
    "Kategori",
    "Banjir",
    "Kebakaran Hutan dan Kekeringan",
    "Tanah Longsor dan Erosi",
  ];

  const sortOptions = [
    "Highest Rated",
    "Newest Listings",
    "Oldest Listings",
    "Alphabetically",
    "Featured",
    "Most Views",
    "Verified",
    "Upcoming Event",
    "Random",
  ];

  // Mapping category to type
  const categoryToType = {
    Banjir: "banjir",
    "Kebakaran Hutan dan Kekeringan": "kebakaran",
    "Tanah Longsor dan Erosi": "longsor",
  };

  // ================= Akhir penambahan CATEGORY TO TYPE MAPPING ================

  // ================= Mulai perubahan FILTERED INCIDENTS (dengan matchesBounds) ================
  // Filter incidents dengan map bounds
  const getFilteredIncidents = () => {
    return incidents.filter((incident) => {
      const matchesSearch =
        searchText === "" ||
        incident.title.toLowerCase().includes(searchText.toLowerCase()) ||
        incident.location.toLowerCase().includes(searchText.toLowerCase());

      const matchesLocation =
        selectedLocation === "All Lokasi" ||
        incident.location
          .toLowerCase()
          .includes(selectedLocation.toLowerCase());

      const matchesCategory =
        selectedCategory === "Kategori" ||
        incident.type === categoryToType[selectedCategory];

      // TAMBAH filter untuk jenis bencana (multiple selection)
      const matchesDisasterTypes =
        selectedDisasterTypes.length === 0 ||
        selectedDisasterTypes.includes(incident.type);

      let matchesBounds = true;
      if (mapBounds && window.L) {
        const [lat, lng] = incident.coordinates;
        matchesBounds = mapBounds.contains([lat, lng]);
      }

      return (
        matchesSearch &&
        matchesLocation &&
        matchesCategory &&
        matchesDisasterTypes &&
        matchesBounds
      );
    });
  };

  const filteredIncidents = getFilteredIncidents();

  // Pagination calculations
  const totalPages = Math.ceil(filteredIncidents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedIncidents = filteredIncidents.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, selectedLocation, selectedCategory, mapBounds, itemsPerPage]);

  // Initialize map once
  useEffect(() => {
    const leafletCSS = document.createElement("link");
    leafletCSS.rel = "stylesheet";
    leafletCSS.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(leafletCSS);

    const clusterCSS = document.createElement("link");
    clusterCSS.rel = "stylesheet";
    clusterCSS.href =
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
    document.head.appendChild(clusterCSS);

    const clusterDefaultCSS = document.createElement("link");
    clusterDefaultCSS.rel = "stylesheet";
    clusterDefaultCSS.href =
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
    document.head.appendChild(clusterDefaultCSS);

    const leafletScript = document.createElement("script");
    leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    leafletScript.onload = () => {
      const clusterScript = document.createElement("script");
      clusterScript.src =
        "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
      clusterScript.onload = () => {
        if (mapRef.current && window.L && !mapInstanceRef.current) {
          console.log("🗺️ Initializing map...");
          const map = window.L.map(mapRef.current).setView([-2.5, 118.0], 5);

          window.L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
              attribution: "&copy; OpenStreetMap contributors",
            },
          ).addTo(map);

          mapInstanceRef.current = map;

          markerClusterGroupRef.current = window.L.markerClusterGroup({
            maxClusterRadius: 80,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            iconCreateFunction: function (cluster) {
              const childCount = cluster.getChildCount();
              let c = " marker-cluster-";
              if (childCount < 10) {
                c += "small";
              } else if (childCount < 30) {
                c += "medium";
              } else {
                c += "large";
              }
              return new window.L.DivIcon({
                html: "<div><span>" + childCount + "</span></div>",
                className: "marker-cluster" + c,
                iconSize: new window.L.Point(40, 40),
              });
            },
          });

          console.log("✅ Cluster group created");

          const updateBounds = () => {
            setMapBounds(map.getBounds());
          };

          map.on("moveend", updateBounds);
          map.on("zoomend", updateBounds);

          updateBounds();

          console.log("✅ Map initialized, triggering marker creation...");
          setTimeout(() => {
            setMapBounds(map.getBounds());
          }, 100);
        }
      };
      document.head.appendChild(clusterScript);
    };
    document.head.appendChild(leafletScript);

    return () => {
      leafletCSS.remove();
      clusterCSS.remove();
      clusterDefaultCSS.remove();
      leafletScript.remove();
    };
  }, []);

  // Update markers based on filters
  useEffect(() => {
    if (
      !mapInstanceRef.current ||
      !window.L ||
      !markerClusterGroupRef.current
    ) {
      console.log("⏳ Waiting for map/cluster to be ready...");
      return;
    }

    console.log("🔄 Updating markers...");

    markerClusterGroupRef.current.clearLayers();

    const createCustomIcon = (type) => {
      let iconContent = "";
      let bgColor = "#3b82f6"; // default blue
      let hoverColor = "#ef4444"; // default hover red

      if (type === "banjir") {
        bgColor = "#3b82f6"; // blue
        hoverColor = "#ef4444"; // hover red (dari kebakaran)
        iconContent = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
        </svg>`;
      } else if (type === "longsor") {
        bgColor = "#f59e0b"; // orange
        hoverColor = "#3b82f6"; // hover blue (dari banjir)
        iconContent = `<img src="/images/landslide-svgrepo-com.svg" style="width: 16px; height: 16px; filter: brightness(0) invert(1);" />`;
      } else if (type === "kebakaran") {
        bgColor = "#ef4444"; // red
        hoverColor = "#f59e0b"; // hover orange (dari longsor)
        iconContent = `<img src="/images/fire-svgrepo-com.svg" style="width: 16px; height: 16px; filter: brightness(0) invert(1);" />`;
      }

      return window.L.divIcon({
        className: "custom-incident-marker",
        html: `
          <style>
            .marker-container-${type} .marker-bg {
              fill: ${bgColor};
              transition: fill 0.3s ease;
            }
            .marker-container-${type}:hover .marker-bg {
              fill: ${hoverColor} !important;
            }
          </style>
          <div class="marker-container marker-container-${type}" style="position: relative; width: 44px; height: 44px; cursor: pointer;">
            <svg class="marker-circle" width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
              <circle class="marker-bg" cx="22" cy="22" r="20" stroke="white" stroke-width="3" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"/>
            </svg>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; display: flex; align-items: center; justify-content: center;">
              ${iconContent}
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22],
      });
    };

    const filteredForMarkers = incidents.filter((incident) => {
      const matchesSearch =
        searchText === "" ||
        incident.title.toLowerCase().includes(searchText.toLowerCase());
      const matchesLocation =
        selectedLocation === "All Lokasi" ||
        incident.location
          .toLowerCase()
          .includes(selectedLocation.toLowerCase());
      const matchesCategory =
        selectedCategory === "Kategori" ||
        incident.type === categoryToType[selectedCategory];

      return matchesSearch && matchesLocation && matchesCategory;
    });

    filteredForMarkers.forEach((incident) => {
      const marker = window.L.marker(incident.coordinates, {
        icon: createCustomIcon(incident.type),
      });

      marker.incidentData = incident;

      marker.on("click", function (e) {
        const inc = this.incidentData;
        if (!inc) return;

        const popupContent = `
          <div onclick="window.navigateToDetail()" style="width: 280px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border-radius: 8px; overflow: hidden; cursor: pointer;">
            <div style="position: relative; width: 100%; height: 180px; overflow: hidden;">
              <img 
                src="${inc.image}" 
                alt="${inc.title}"
                style="width: 100%; height: 100%; object-fit: cover;"
              />
              
              <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);"></div>
              
              <button 
                onclick="event.stopPropagation(); event.preventDefault(); if(window.closeCurrentPopup) window.closeCurrentPopup();"
                style="position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; background: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10; font-size: 16px; line-height: 1; color: #333; padding: 0; transition: background-color 0.2s;"
                onmouseover="this.style.backgroundColor='#f3f4f6'"
                onmouseout="this.style.backgroundColor='white'"
              >
                ×
              </button>
              
              <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 16px; z-index: 5; pointer-events: none;">
                <h3 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: white; line-height: 1.3; text-shadow: 0 1px 3px rgba(0,0,0,0.3);">
                  ${inc.title}
                </h3>
                <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.9); text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                  ${inc.location}
                </p>
              </div>
            </div>
            
            <div style="background: white; padding: 12px 16px;">
              <p style="margin: 0; font-size: 13px; color: #999;">
                Not rated yet
              </p>
            </div>
          </div>
        `;

        window.navigateToDetail = () => {
          navigate("/detailkejadian", { state: { incident: inc } });
        };

        window.closeCurrentPopup = () => {
          mapInstanceRef.current.closePopup();
        };

        try {
          const popup = window.L.popup({
            maxWidth: 280,
            minWidth: 280,
            closeButton: false,
            className: "custom-incident-popup",
            autoClose: true,
            closeOnClick: true,
          })
            .setLatLng(e.latlng)
            .setContent(popupContent);

          popup.openOn(mapInstanceRef.current);
        } catch (error) {
          console.error("❌ Error creating/opening popup:", error);
        }
      });

      markerClusterGroupRef.current.addLayer(marker);
    });

    if (markerClusterGroupRef.current.getLayers().length > 0) {
      mapInstanceRef.current.addLayer(markerClusterGroupRef.current);
    }

    console.log(`✅ Added ${filteredForMarkers.length} markers to map`);

    // TAMBAHKAN INI - auto fit bounds pertama kali
    if (filteredForMarkers.length > 0 && !mapBounds) {
      try {
        const bounds = window.L.latLngBounds(
          filteredForMarkers.map((inc) => inc.coordinates),
        );
        mapInstanceRef.current.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 10,
        });
      } catch (error) {
        console.error("Error fitting bounds:", error);
      }
    }
  }, [
    incidents,
    searchText,
    selectedLocation,
    selectedCategory,
    mapBounds,
    navigate,
  ]);

  return (
    <>
      <style>
        {`
          .custom-incident-marker {
            background: none;
            border: none;
          }
          
          .marker-container:hover .marker-bg {
            fill: #ef4444 !important;
          }
          
          .custom-incident-popup .leaflet-popup-content-wrapper {
            border-radius: 12px;
            padding: 0;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          }
          .custom-incident-popup .leaflet-popup-content {
            margin: 0;
            width: 280px !important;
          }
          .custom-incident-popup .leaflet-popup-tip-container {
            display: none;
          }

          .custom-incident-popup .leaflet-popup-content-wrapper:hover {
            box-shadow: 0 6px 24px rgba(0,0,0,0.2);
            transform: translateY(-2px);
            transition: all 0.3s ease;
          }

          .marker-cluster-small {
            background-color: rgba(181, 226, 140, 0.6);
          }
          .marker-cluster-small div {
            background-color: rgba(110, 204, 57, 0.6);
          }
          .marker-cluster-medium {
            background-color: rgba(241, 211, 87, 0.6);
          }
          .marker-cluster-medium div {
            background-color: rgba(240, 194, 12, 0.6);
          }
          .marker-cluster-large {
            background-color: rgba(253, 156, 115, 0.6);
          }
          .marker-cluster-large div {
            background-color: rgba(241, 128, 23, 0.6);
          }
          .marker-cluster {
            background-clip: padding-box;
            border-radius: 20px;
          }
          .marker-cluster div {
            width: 30px;
            height: 30px;
            margin-left: 5px;
            margin-top: 5px;
            text-align: center;
            border-radius: 15px;
            font: 12px "Helvetica Neue", Arial, Helvetica, sans-serif;
          }
          .marker-cluster span {
            line-height: 30px;
            color: white;
            font-weight: bold;
          }
        `}
      </style>
      {isAuthenticated && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="2"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span className="text-green-800 text-sm font-medium">
                Logged in as Admin
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col w-full bg-gray-50">
        <Header currentPage="kejadian" />
        {/* Map Section */}
        <div className="relative w-full" style={{ height: "500px" }}>
          <div ref={mapRef} style={{ height: "100%", width: "100%" }} />

          {/* Menu Button */}
          {/* <div className="absolute top-4 left-4 z-[1000]">
          <div className="relative">
            <button 
              onClick={() => setShowMenuDropdown(!showMenuDropdown)}
              className="bg-orange-500 text-white px-4 py-2 rounded shadow-lg font-semibold hover:bg-orange-600"
            >
              MENU
            </button>
            {showMenuDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowMenuDropdown(false)}
                />
                <div className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-xl border border-gray-200 w-48 z-50">
                  <div
                    onClick={() => {
                      navigate('/kerawanan');
                      setShowMenuDropdown(false);
                    }}
                    className="px-4 py-3 hover:bg-orange-50 cursor-pointer text-gray-700 font-medium border-b border-gray-200"
                  >
                    Kerawanan
                  </div>
                  <div
                    onClick={() => {
                      navigate('/kebencanaan');
                      setShowMenuDropdown(false);
                    }}
                   className="px-4 py-3 hover:bg-orange-50 cursor-pointer text-gray-700 font-medium border-b border-gray-200"
                  >
                    Kejadian
                  </div>
                  <div
                    onClick={() => {
                      navigate('/tentang-kami');
                      setShowMenuDropdown(false);
                    }}
                    className="px-4 py-3 hover:bg-orange-50 cursor-pointer text-gray-700 font-medium"
                  >
                    Tentang Kami
                  </div>
                </div>
              </>
            )}
          </div>
        </div> */}

          {/* Search Bar Overlay */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-full max-w-5xl px-4 z-[1000]">
            <div className="bg-white rounded-full shadow-xl flex items-center overflow-visible relative">
              <input
                type="text"
                placeholder="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="flex-1 px-6 py-4 text-gray-700 focus:outline-none rounded-l-full"
              />

              {/* Location Dropdown */}
              <div className="relative border-l border-gray-200">
                <button
                  onClick={() => {
                    setShowLocationDropdown(!showLocationDropdown);
                    setShowCategoryDropdown(false);
                    setShowSortDropdown(false);
                    setShowDistanceDropdown(false);
                  }}
                  className="px-6 py-4 text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {selectedLocation}
                  <span className="text-gray-400">▼</span>
                </button>
                {showLocationDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-[1001] pointer-events-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLocationDropdown(false);
                      }}
                    />
                    <div
                      className="absolute top-full mb-2 left-0 bg-white rounded-lg shadow-xl border border-gray-200 max-h-96 overflow-y-auto w-64 z-[1002] pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-2">
                        {provinces.map((province) => (
                          <div
                            key={province}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLocation(province);
                              setShowLocationDropdown(false);
                            }}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer rounded text-gray-700"
                          >
                            {province}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Category Dropdown */}
              <div className="relative border-l border-gray-200">
                <button
                  onClick={() => {
                    setShowCategoryDropdown(!showCategoryDropdown);
                    setShowLocationDropdown(false);
                    setShowSortDropdown(false);
                    setShowDistanceDropdown(false);
                  }}
                  className="px-6 py-4 text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {selectedCategory}
                  <span className="text-gray-400">▼</span>
                </button>
                {showCategoryDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-[1001] pointer-events-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCategoryDropdown(false);
                      }}
                    />
                    <div
                      className="absolute top-full mb-2 left-0 bg-white rounded-lg shadow-xl border border-gray-200 w-80 z-[1002] pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-2">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCategory("Kategori");
                            setShowCategoryDropdown(false);
                          }}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer rounded text-gray-700"
                        >
                          Kategori
                        </div>
                        {categories.slice(1).map((category) => (
                          <div
                            key={category}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategory(category);
                              setShowCategoryDropdown(false);
                            }}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer rounded text-gray-700"
                          >
                            {category}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Search Button */}
              <button className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-8 py-4 font-semibold hover:from-red-600 hover:to-pink-600 transition rounded-r-full">
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Incidents Section */}
        <div className="flex-1 overflow-y-auto bg-white">
          {/* Controls */}
          <div className="border-b border-gray-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${viewMode === "grid" ? "bg-red-50 text-red-500 border-2 border-red-500" : "bg-white text-gray-400 border-2 border-gray-200"}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${viewMode === "list" ? "bg-red-50 text-red-500 border-2 border-red-500" : "bg-white text-gray-400 border-2 border-gray-200"}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h14v2H3v-2z" />
                </svg>
              </button>

              {isAuthenticated && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="p-2 rounded bg-white text-gray-400 border-2 border-gray-200 hover:bg-gray-50"
                  title="Tambah Kejadian"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}

              {/* Display count of visible incidents */}
              <span className="ml-2 text-sm text-gray-600">
                Menampilkan {startIndex + 1}-
                {Math.min(endIndex, filteredIncidents.length)} dari{" "}
                {filteredIncidents.length} kejadian
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Items Per Page Selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowItemsPerPageDropdown(!showItemsPerPageDropdown);
                    setShowSortDropdown(false);
                    setShowDistanceDropdown(false);
                    setShowLocationDropdown(false);
                    setShowCategoryDropdown(false);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="text-sm">{itemsPerPage} per halaman</span>
                  <span className="text-gray-400">▼</span>
                </button>
                {showItemsPerPageDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowItemsPerPageDropdown(false)}
                    />
                    <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-gray-200 w-40 z-50">
                      {[10, 30, 50, 100].map((num) => (
                        <div
                          key={num}
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemsPerPage(num);
                            setShowItemsPerPageDropdown(false);
                          }}
                          className={`px-4 py-2 hover:bg-gray-100 cursor-pointer ${
                            num === itemsPerPage
                              ? "bg-red-500 text-white hover:bg-red-600"
                              : "text-gray-700"
                          }`}
                        >
                          {num} per halaman
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Sort Dropdown
            <div className="relative">
              <button
                onClick={() => {
                  setShowSortDropdown(!showSortDropdown);
                  setShowDistanceDropdown(false);
                  setShowLocationDropdown(false);
                  setShowCategoryDropdown(false);
                  setShowItemsPerPageDropdown(false);
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
              >
                {sortBy}
                <span className="text-gray-400">▼</span>
              </button>
              {showSortDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowSortDropdown(false)}
                  />
                  <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-gray-200 w-56 z-50">
                    {sortOptions.map((option) => (
                      <div
                        key={option}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSortBy(option);
                          setShowSortDropdown(false);
                        }}
                        className={`px-4 py-2 hover:bg-gray-100 cursor-pointer ${
                          option === sortBy ? 'bg-red-500 text-white hover:bg-red-600' : 'text-gray-700'
                        }`}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div> */}

              {/* Distance Radius Dropdown
            <div className="relative">
              <button
                onClick={() => {
                  setShowDistanceDropdown(!showDistanceDropdown);
                  setShowSortDropdown(false);
                  setShowLocationDropdown(false);
                  setShowCategoryDropdown(false);
                  setShowItemsPerPageDropdown(false);
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
              >
                Distance Radius
                <span className="text-gray-400">▼</span>
              </button>
              {showDistanceDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowDistanceDropdown(false)}
                  />
                  <div 
                    className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-gray-200 w-80 p-4 z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-4">
                      <div className="text-2xl font-bold text-gray-800 mb-2">
                        {distanceEnabled ? `${distanceRadius}km` : 'Disabled'}
                      </div>
                      <div className="text-sm text-gray-500">Radius around selected destination</div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={distanceRadius}
                      onChange={(e) => setDistanceRadius(parseInt(e.target.value))}
                      disabled={!distanceEnabled}
                      className={`w-full h-2 bg-gray-200 rounded-lg appearance-none ${distanceEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                      style={{
                        background: distanceEnabled 
                          ? `linear-gradient(to right, #ef4444 0%, #ef4444 ${distanceRadius/2}%, #e5e7eb ${distanceRadius/2}%, #e5e7eb 100%)`
                          : '#e5e7eb'
                      }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDistanceEnabled(!distanceEnabled);
                      }}
                      className={`mt-4 w-full px-4 py-2 rounded transition ${
                        distanceEnabled 
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                          : 'bg-red-500 text-white hover:bg-red-600'
                      }`}
                    >
                      {distanceEnabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </>
              )}
            </div> */}

              {/* Jenis Bencana Filter */}
              <div className="relative">
                <button
                  onClick={() => setShowMoreFilters(!showMoreFilters)}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
                >
                  Jenis Bencana
                  {selectedDisasterTypes.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                      {selectedDisasterTypes.length}
                    </span>
                  )}
                  <span className="text-gray-400">▼</span>
                </button>
                {showMoreFilters && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowMoreFilters(false)}
                    />
                    <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-gray-200 w-64 z-50">
                      <div className="p-3">
                        <div className="text-sm font-semibold text-gray-700 mb-3">
                          Pilih Jenis Bencana
                        </div>

                        {/* Banjir */}
                        <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedDisasterTypes.includes("banjir")}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDisasterTypes([
                                  ...selectedDisasterTypes,
                                  "banjir",
                                ]);
                              } else {
                                setSelectedDisasterTypes(
                                  selectedDisasterTypes.filter(
                                    (t) => t !== "banjir",
                                  ),
                                );
                              }
                            }}
                            className="w-4 h-4 text-red-500 rounded focus:ring-red-500"
                          />
                          <span className="text-sm text-gray-700">Banjir</span>
                        </label>

                        {/* Longsor */}
                        <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedDisasterTypes.includes("longsor")}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDisasterTypes([
                                  ...selectedDisasterTypes,
                                  "longsor",
                                ]);
                              } else {
                                setSelectedDisasterTypes(
                                  selectedDisasterTypes.filter(
                                    (t) => t !== "longsor",
                                  ),
                                );
                              }
                            }}
                            className="w-4 h-4 text-red-500 rounded focus:ring-red-500"
                          />
                          <span className="text-sm text-gray-700">
                            Tanah Longsor
                          </span>
                        </label>

                        {/* Kebakaran */}
                        <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedDisasterTypes.includes(
                              "kebakaran",
                            )}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDisasterTypes([
                                  ...selectedDisasterTypes,
                                  "kebakaran",
                                ]);
                              } else {
                                setSelectedDisasterTypes(
                                  selectedDisasterTypes.filter(
                                    (t) => t !== "kebakaran",
                                  ),
                                );
                              }
                            }}
                            className="w-4 h-4 text-red-500 rounded focus:ring-red-500"
                          />
                          <span className="text-sm text-gray-700">
                            Kebakaran Hutan
                          </span>
                        </label>

                        {/* Clear Filter Button */}
                        {selectedDisasterTypes.length > 0 && (
                          <button
                            onClick={() => setSelectedDisasterTypes([])}
                            className="w-full mt-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition"
                          >
                            Hapus Semua Filter
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Incidents Display */}
          <div className="p-6">
            {filteredIncidents.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">
                  Tidak ada kejadian yang ditemukan
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  Coba ubah filter pencarian atau zoom peta Anda
                </p>
              </div>
            ) : (
              <>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-3 gap-6">
                    {paginatedIncidents.map((incident) => (
                      <div
                        key={incident.id}
                        className="bg-white rounded-lg overflow-hidden shadow hover:shadow-lg transition group"
                      >
                        <div
                          onClick={() =>
                            navigate("/detailkejadian", { state: { incident } })
                          }
                          className="cursor-pointer"
                        >
                          <div className="relative">
                            <img
                              src={incident.image}
                              alt={incident.title}
                              className="w-full h-48 object-cover"
                            />
                            {incident.featured && (
                              <div className="absolute top-3 left-3 bg-yellow-400 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                                <span>⭐</span> Featured
                              </div>
                            )}
                            {/* <button onClick={(e) => e.stopPropagation()} className="absolute top-3 right-3 bg-white rounded-full p-2 hover:bg-gray-100">
                            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/>
                            </svg>
                          </button> */}
                            <div className="absolute bottom-3 left-3">
                              <span className="bg-red-500 text-white px-3 py-1 rounded text-xs font-semibold">
                                {incident.category}
                              </span>
                            </div>
                          </div>
                          <div className="p-4">
                            <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2 group-hover:text-red-500 transition">
                              {incident.title}
                            </h3>
                            <div className="text-sm text-gray-500 mb-1">
                              {incident.location}
                            </div>
                            <div className="text-xs text-gray-400">
                              {incident.date}
                            </div>
                          </div>
                        </div>

                        {/* ADMIN CONTROLS - hanya muncul jika logged in */}
                        {isAuthenticated && (
                          <div className="p-3 border-t border-gray-200 bg-gray-50 flex gap-2">
                            {/* Edit Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditKejadian(incident);
                              }}
                              className="flex-1 px-3 py-1.5 bg-blue-100 text-blue-600 rounded text-xs font-medium hover:bg-blue-200 transition"
                            >
                              ✏️ Edit
                            </button>
                            {/* Toggle Featured */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFeatured(
                                  incident.id,
                                  incident.featured,
                                );
                              }}
                              className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition ${
                                incident.featured
                                  ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                              }`}
                            >
                              {incident.featured
                                ? "⭐ Featured"
                                : "☆ Set Featured"}
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteKejadian(incident.id);
                              }}
                              className="px-3 py-1.5 bg-red-100 text-red-600 rounded text-xs font-medium hover:bg-red-200 transition"
                            >
                              🗑️ Hapus
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paginatedIncidents.map((incident) => (
                      <div
                        key={incident.id}
                        className="bg-white rounded-lg overflow-hidden shadow hover:shadow-lg transition"
                      >
                        <div
                          onClick={() =>
                            navigate("/detailkejadian", { state: { incident } })
                          }
                          className="flex cursor-pointer group"
                        >
                          <div className="relative w-80 flex-shrink-0">
                            <img
                              src={incident.image}
                              alt={incident.title}
                              className="w-full h-48 object-cover object-center"
                            />
                            {incident.featured && (
                              <div className="absolute top-3 left-3 bg-yellow-400 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                                <span>⭐</span> Featured
                              </div>
                            )}
                            <div className="absolute bottom-3 left-3">
                              <span className="bg-red-500 text-white px-3 py-1 rounded text-xs font-semibold">
                                {incident.category}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 p-6 flex flex-col justify-between">
                            <div>
                              <h3 className="text-xl font-semibold text-gray-800 mb-2 group-hover:text-red-500 transition">
                                {incident.title}
                              </h3>
                              <div className="text-sm text-gray-500 mb-1">
                                {incident.location}
                              </div>
                              <div className="text-xs text-gray-400">
                                {incident.date}
                              </div>
                            </div>
                          </div>
                          <div className="p-6 flex items-center">
                            {/* <button onClick={(e) => e.stopPropagation()} className="bg-white rounded-full p-3 hover:bg-gray-100 border-2 border-gray-200">
                            <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/>
                            </svg>
                          </button> */}
                          </div>
                        </div>

                        {/* ADMIN CONTROLS - hanya muncul jika logged in */}
                        {isAuthenticated && (
                          <div className="p-3 border-t border-gray-200 bg-gray-50 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditKejadian(incident);
                              }}
                              className="flex-1 px-4 py-2 bg-blue-100 text-blue-600 rounded text-sm font-medium hover:bg-blue-200 transition"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFeatured(
                                  incident.id,
                                  incident.featured,
                                );
                              }}
                              className={`flex-1 px-4 py-2 rounded text-sm font-medium transition ${
                                incident.featured
                                  ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                              }`}
                            >
                              {incident.featured
                                ? "⭐ Featured"
                                : "☆ Set Featured"}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteKejadian(incident.id);
                              }}
                              className="px-4 py-2 bg-red-100 text-red-600 rounded text-sm font-medium hover:bg-red-200 transition"
                            >
                              🗑️ Hapus
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    {/* Previous Button */}
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded border ${
                        currentPage === 1
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                      }`}
                    >
                      « Previous
                    </button>

                    {/* Page Numbers */}
                    <div className="flex gap-1">
                      {/* First Page */}
                      {currentPage > 3 && (
                        <>
                          <button
                            onClick={() => setCurrentPage(1)}
                            className="px-4 py-2 rounded border bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                          >
                            1
                          </button>
                          {currentPage > 4 && (
                            <span className="px-2 py-2 text-gray-400">...</span>
                          )}
                        </>
                      )}

                      {/* Pages around current */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          return (
                            page === currentPage ||
                            page === currentPage - 1 ||
                            page === currentPage + 1 ||
                            page === currentPage - 2 ||
                            page === currentPage + 2
                          );
                        })
                        .map((page) => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-4 py-2 rounded border ${
                              currentPage === page
                                ? "bg-red-500 text-white border-red-500"
                                : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                            }`}
                          >
                            {page}
                          </button>
                        ))}

                      {/* Last Page */}
                      {currentPage < totalPages - 2 && (
                        <>
                          {currentPage < totalPages - 3 && (
                            <span className="px-2 py-2 text-gray-400">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(totalPages)}
                            className="px-4 py-2 rounded border bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Next Button */}
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded border ${
                        currentPage === totalPages
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                      }`}
                    >
                      Next »
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Kejadian Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/75 bg-opacity-50 flex justify-center items-center z-[10000] p-4 overflow-y-auto"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-lg my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800">
                {isEditMode ? "Edit Laporan Bencana" : "Tambah Laporan Bencana"}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  // Reset form data
                  setFormData({
                    thumbnail: null,
                    thumbnailPreview: null,
                    images: [],
                    title: "",
                    description: "",
                    incidentDate: "",
                    lokasi: "",
                    disasterType: "",
                    das: "",
                    longitude: "",
                    latitude: "",
                    featured: true,
                  });
                  // Reset DAS options
                  setDasOptions([]);
                  setIsLoadingDas(false);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={handleModalSubmit}
              className="space-y-4 max-h-[70vh] overflow-y-auto px-2"
            >
              {/* Thumbnail Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Gambar Thumbnail Laporan
                </label>

                {!formData.thumbnail ? (
                  <div
                    onClick={() =>
                      document.getElementById("thumbnail")?.click()
                    }
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition"
                  >
                    <input
                      type="file"
                      id="thumbnail"
                      name="thumbnail"
                      accept="image/*"
                      onChange={handleModalFileChange}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center">
                      <svg
                        className="w-12 h-12 text-gray-400 mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <p className="text-gray-600 font-medium">
                        Upload Thumbnail
                      </p>
                      <p className="text-gray-400 text-sm mt-1">
                        Klik untuk memilih gambar
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden group">
                    <img
                      src={formData.thumbnailPreview}
                      alt="Thumbnail Preview"
                      className="w-full h-48 object-cover"
                    />

                    <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById("thumbnail")?.click()
                        }
                        className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition"
                        title="Ganti gambar"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveThumbnail}
                        className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                        title="Hapus gambar"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="p-2 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-sm text-gray-600 truncate">
                        {formData.thumbnail.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {(formData.thumbnail.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>

                    <input
                      type="file"
                      id="thumbnail"
                      name="thumbnail"
                      accept="image/*"
                      onChange={handleModalFileChange}
                      className="hidden"
                    />
                  </div>
                )}
              </div>

              {/* Images Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Foto Kegiatan
                </label>
                <div
                  onClick={() => document.getElementById("images")?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition"
                >
                  <input
                    type="file"
                    id="images"
                    name="images"
                    accept="image/*"
                    multiple
                    onChange={handleModalFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center">
                    <svg
                      className="w-12 h-12 text-gray-400 mb-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <p className="text-gray-600 font-medium">
                      Upload Foto Kegiatan
                    </p>
                  </div>
                </div>

                {formData.images.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {formData.images.map((file, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded"
                      >
                        <span className="text-gray-700 truncate">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newFiles = [...formData.images];
                            newFiles.splice(index, 1);
                            setFormData((prev) => ({
                              ...prev,
                              images: newFiles,
                            }));
                          }}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Judul Laporan
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deskripsi
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleModalInputChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                ></textarea>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tanggal Kejadian
                </label>
                <input
                  type="date"
                  name="incidentDate"
                  value={formData.incidentDate}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleModalInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.000001"
                    placeholder="Contoh: 108.65"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleModalInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.000001"
                    placeholder="Contoh: -7.62"
                    required
                  />
                </div>
              </div>

              {/* Lokasi - Auto-filled */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lokasi
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="lokasi"
                    value={formData.lokasi}
                    onChange={handleModalInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Akan terisi otomatis dari koordinat, atau ketik manual"
                    disabled={formData.isLoadingLocation}
                  />
                  {formData.isLoadingLocation && (
                    <div className="absolute right-3 top-2.5">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  )}
                </div>
                {formData.isLoadingLocation && (
                  <p className="text-xs text-blue-600 mt-1">
                    ⏳ Mengambil data lokasi...
                  </p>
                )}
                {formData.locationError && (
                  <p className="text-xs text-red-600 mt-1">
                    ❌ {formData.locationError}
                  </p>
                )}
                {formData.lokasi &&
                  !formData.isLoadingLocation &&
                  !formData.locationError && (
                    <p className="text-xs text-green-600 mt-1">
                      ✅ Lokasi terisi otomatis dari koordinat
                    </p>
                  )}
              </div>

              {/* Disaster Type & DAS */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Jenis Bencana */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jenis Bencana
                  </label>
                  <select
                    value={formData.disasterType}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        disasterType: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Pilih Jenis Bencana</option>
                    <option value="Banjir">Banjir</option>
                    <option value="Tanah Longsor dan Erosi">
                      Tanah Longsor dan Erosi
                    </option>
                    <option value="Kebakaran Hutan dan Kekeringan">
                      Kebakaran Hutan dan Kekeringan
                    </option>
                  </select>
                </div>

                {/* DAS */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    DAS
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.das}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          das: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="DAS akan terisi otomatis berdasarkan koordinat"
                      disabled={isLoadingDas}
                    />
                    {isLoadingDas && (
                      <div className="absolute right-3 top-2.5">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>
                  {isLoadingDas && (
                    <p className="text-xs text-blue-600 mt-1">
                      ⏳ Mengambil data DAS...
                    </p>
                  )}
                  {formData.dasError && (
                    <p className="text-xs text-yellow-600 mt-1">
                      ⚠️ {formData.dasError}
                    </p>
                  )}
                  {formData.das && !isLoadingDas && !formData.dasError && (
                    <p className="text-xs text-green-600 mt-1">
                      ✅ DAS terisi otomatis dari koordinat
                    </p>
                  )}
                </div>
              </div>

              {/* Curah Hujan - Full Width */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Curah Hujan (mm)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={
                      formData.curahHujan !== null ? formData.curahHujan : ""
                    }
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        curahHujan: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Curah hujan akan terisi otomatis berdasarkan lokasi dan tanggal"
                    disabled={formData.isLoadingRainfall}
                  />
                  {formData.isLoadingRainfall && (
                    <div className="absolute right-3 top-2.5">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  )}
                </div>
                {formData.isLoadingRainfall && (
                  <p className="text-xs text-blue-600 mt-1">
                    ⏳ Mengambil data curah hujan...
                  </p>
                )}
                {formData.rainfallError && (
                  <p className="text-xs text-red-600 mt-1">
                    ❌ {formData.rainfallError}
                  </p>
                )}
                {formData.curahHujan !== null &&
                  formData.curahHujan > 0 &&
                  !formData.isLoadingRainfall &&
                  !formData.rainfallError && (
                    <p className="text-xs text-green-600 mt-1">
                      ✅ Data curah hujan: {formData.curahHujan} mm
                    </p>
                  )}
                {formData.curahHujan !== null &&
                  formData.curahHujan === 0 &&
                  !formData.isLoadingRainfall && (
                    <p className="text-xs text-yellow-600 mt-1">
                      ⚠️ Tidak ada data curah hujan untuk tanggal ini
                    </p>
                  )}
              </div>

              {/* Featured Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Featured
                  </label>
                  <p className="text-xs text-gray-500">
                    Tampilkan di halaman utama
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      featured: !prev.featured,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.featured ? "bg-green-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.featured ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setIsEditMode(false);
                    setEditingKejadianId(null);
                    setFormData({
                      thumbnail: null,
                      thumbnailPreview: null,
                      images: [],
                      title: "",
                      description: "",
                      incidentDate: "",
                      lokasi: "",
                      disasterType: "",
                      das: "",
                      longitude: "",
                      latitude: "",
                      featured: true,
                    });
                    setDasOptions([]); // Tambahkan ini
                    setIsLoadingDas(false); // Tambahkan ini
                  }}
                  type="button"
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
                >
                  {isEditMode ? "Update" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Kebencanaan;
